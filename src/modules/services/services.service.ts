import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { uploadBufferToR2, deleteFromR2 } from '../../config/r2';

const MEDIA_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

interface ListServicesQuery {
  categoryId?: string;
  technicianId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  page: number;
  limit: number;
}

interface ServiceInput {
  title: string;
  description?: string;
  price: number;
  categoryId: string;
}

const technicianInclude = {
  category: true,
  technician: { include: { user: { select: { id: true, name: true } } } },
  media: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.ServiceInclude;

export const listServices = async (query: ListServicesQuery) => {
  const where: Prisma.ServiceWhereInput = {
    technician: { user: { status: 'ACTIVE' } },
    ...(query.categoryId ? { categoryId: query.categoryId } : {}),
    ...(query.technicianId ? { technicianId: query.technicianId } : {}),
    ...(query.minPrice !== undefined || query.maxPrice !== undefined
      ? {
          price: {
            ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
          },
        }
      : {}),
    ...(query.search
      ? {
          OR: [
            { title: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            { description: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.service.findMany({
      where,
      include: technicianInclude,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.service.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit };
};

export const getServiceById = async (id: string) => {
  // findFirst (not findUnique) so a banned technician's service can be
  // filtered in the same query, matching listServices' visibility rule.
  const service = await prisma.service.findFirst({
    where: { id, technician: { user: { status: 'ACTIVE' } } },
    include: technicianInclude,
  });
  if (!service) {
    throw new AppError(404, 'Service not found');
  }
  return service;
};

const getOwnTechnicianProfile = async (userId: string) => {
  const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, 'Technician profile not found');
  }
  return profile;
};

const assertCategoryExists = async (categoryId: string) => {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new AppError(404, 'Category not found');
  }
};

export const createService = async (userId: string, data: ServiceInput) => {
  const profile = await getOwnTechnicianProfile(userId);
  await assertCategoryExists(data.categoryId);

  return prisma.service.create({
    data: {
      title: data.title,
      description: data.description,
      price: data.price,
      categoryId: data.categoryId,
      technicianId: profile.id,
    },
    include: technicianInclude,
  });
};

export const updateService = async (userId: string, serviceId: string, data: Partial<ServiceInput>) => {
  const profile = await getOwnTechnicianProfile(userId);
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    throw new AppError(404, 'Service not found');
  }
  if (service.technicianId !== profile.id) {
    throw new AppError(403, 'You can only update your own services');
  }
  if (data.categoryId) {
    await assertCategoryExists(data.categoryId);
  }

  return prisma.service.update({ where: { id: serviceId }, data, include: technicianInclude });
};

export const deleteService = async (userId: string, serviceId: string) => {
  const profile = await getOwnTechnicianProfile(userId);
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    throw new AppError(404, 'Service not found');
  }
  if (service.technicianId !== profile.id) {
    throw new AppError(403, 'You can only delete your own services');
  }
  const bookingCount = await prisma.booking.count({ where: { serviceId } });
  if (bookingCount > 0) {
    throw new AppError(400, 'Cannot delete a service that already has bookings');
  }
  await prisma.service.delete({ where: { id: serviceId } });
};

const assertOwnService = async (userId: string, serviceId: string) => {
  const profile = await getOwnTechnicianProfile(userId);
  const service = await prisma.service.findUnique({ where: { id: serviceId } });
  if (!service) {
    throw new AppError(404, 'Service not found');
  }
  if (service.technicianId !== profile.id) {
    throw new AppError(403, 'You can only manage media on your own services');
  }
  return service;
};

export const addServiceMedia = async (userId: string, serviceId: string, file: Express.Multer.File) => {
  await assertOwnService(userId, serviceId);

  const isVideo = file.mimetype.startsWith('video/');
  const ext = MEDIA_EXTENSIONS[file.mimetype] ?? 'bin';
  const key = `service-media/${randomUUID()}.${ext}`;
  const url = await uploadBufferToR2(file.buffer, key, file.mimetype);

  return prisma.serviceMedia.create({
    data: {
      serviceId,
      url,
      // `publicId` holds the R2 object key here (needed to delete the object later),
      // not a Cloudinary-style id - same column, repurposed for the R2 integration.
      publicId: key,
      type: isVideo ? 'VIDEO' : 'PHOTO',
    },
  });
};

export const removeServiceMedia = async (userId: string, serviceId: string, mediaId: string) => {
  await assertOwnService(userId, serviceId);

  const media = await prisma.serviceMedia.findUnique({ where: { id: mediaId } });
  if (!media || media.serviceId !== serviceId) {
    throw new AppError(404, 'Media not found');
  }

  await deleteFromR2(media.publicId);
  await prisma.serviceMedia.delete({ where: { id: mediaId } });
};
