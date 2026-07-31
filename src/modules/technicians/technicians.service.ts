import { Prisma } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';

interface ListTechniciansQuery {
  categoryId?: string;
  location?: string;
  minRating?: number;
  search?: string;
  page: number;
  limit: number;
}

interface Slot {
  date: Date;
  startTime: string;
  endTime: string;
}

const publicTechnicianInclude = {
  user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
  services: { include: { category: true } },
} satisfies Prisma.TechnicianProfileInclude;

export const listTechnicians = async (query: ListTechniciansQuery) => {
  const userWhere: Prisma.UserWhereInput = {
    status: 'ACTIVE',
    ...(query.search ? { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } } : {}),
  };

  const where: Prisma.TechnicianProfileWhereInput = {
    user: userWhere,
    ...(query.location ? { location: { contains: query.location, mode: Prisma.QueryMode.insensitive } } : {}),
    ...(query.minRating !== undefined ? { avgRating: { gte: query.minRating } } : {}),
    ...(query.categoryId ? { services: { some: { categoryId: query.categoryId } } } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.technicianProfile.findMany({
      where,
      include: publicTechnicianInclude,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { avgRating: 'desc' },
    }),
    prisma.technicianProfile.count({ where }),
  ]);

  return { items, total, page: query.page, limit: query.limit };
};

export const getTechnicianById = async (id: string) => {
  // findFirst (not findUnique) so a banned technician's user status can be
  // filtered in the same query, matching listTechnicians' visibility rule.
  const technician = await prisma.technicianProfile.findFirst({
    where: { id, user: { status: 'ACTIVE' } },
    include: {
      ...publicTechnicianInclude,
      reviews: {
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { customer: { select: { id: true, name: true } } },
      },
    },
  });
  if (!technician) {
    throw new AppError(404, 'Technician not found');
  }
  return technician;
};

const getOwnProfileOrThrow = async (userId: string) => {
  const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, 'Technician profile not found');
  }
  return profile;
};

export const updateOwnProfile = async (
  userId: string,
  data: { bio?: string; experienceYears?: number; location?: string }
) => {
  await getOwnProfileOrThrow(userId);
  return prisma.technicianProfile.update({ where: { userId }, data });
};

export const setOwnAvailability = async (userId: string, slots: Slot[]) => {
  const profile = await getOwnProfileOrThrow(userId);

  return prisma.$transaction(async (tx) => {
    await tx.availability.deleteMany({ where: { technicianId: profile.id, isBooked: false } });
    if (slots.length > 0) {
      await tx.availability.createMany({
        data: slots.map((slot) => ({
          technicianId: profile.id,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })),
      });
    }
    return tx.availability.findMany({
      where: { technicianId: profile.id },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    });
  });
};

export const getOwnAvailability = async (userId: string) => {
  const profile = await getOwnProfileOrThrow(userId);
  return prisma.availability.findMany({
    where: { technicianId: profile.id },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
};

export const getPublicAvailability = async (technicianId: string) => {
  const technician = await prisma.technicianProfile.findFirst({
    where: { id: technicianId, user: { status: 'ACTIVE' } },
  });
  if (!technician) {
    throw new AppError(404, 'Technician not found');
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return prisma.availability.findMany({
    where: { technicianId, date: { gte: today } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
  });
};
