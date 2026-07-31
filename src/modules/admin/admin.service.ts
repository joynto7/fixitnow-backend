import { Prisma, Role, UserStatus, BookingStatus } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { sanitizeUser } from '../../utils/sanitizeUser';

interface ListUsersQuery {
  role?: Role;
  status?: UserStatus;
  search?: string;
  page: number;
  limit: number;
}

export const getPlatformStats = async () => {
  const [totalUsers, customers, technicians, banned, totalBookings, bookingsByStatus, totalCategories, revenue] =
    await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: 'CUSTOMER' } }),
      prisma.user.count({ where: { role: 'TECHNICIAN' } }),
      prisma.user.count({ where: { status: 'BANNED' } }),
      prisma.booking.count(),
      prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.category.count(),
      prisma.payment.aggregate({ where: { status: 'COMPLETED' }, _sum: { amount: true } }),
    ]);

  return {
    users: { total: totalUsers, customers, technicians, banned },
    bookings: {
      total: totalBookings,
      byStatus: Object.fromEntries(bookingsByStatus.map((b) => [b.status, b._count._all])),
    },
    categories: totalCategories,
    revenue: Number(revenue._sum.amount ?? 0),
  };
};

export const listUsers = async (query: ListUsersQuery) => {
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
            { email: { contains: query.search, mode: Prisma.QueryMode.insensitive } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      include: { technicianProfile: true },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.user.count({ where }),
  ]);
  return { items: items.map(sanitizeUser), total, page: query.page, limit: query.limit };
};

export const updateUserStatus = async (adminId: string, userId: string, status: UserStatus) => {
  if (adminId === userId) {
    throw new AppError(400, 'You cannot change your own account status');
  }
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError(404, 'User not found');
  }
  if (user.role === 'ADMIN') {
    throw new AppError(400, 'Cannot change the status of an admin account');
  }
  const updated = await prisma.user.update({ where: { id: userId }, data: { status } });
  return sanitizeUser(updated);
};

interface ListBookingsQuery {
  status?: BookingStatus;
  customerId?: string;
  technicianId?: string;
  page: number;
  limit: number;
}

const adminBookingInclude = {
  service: { include: { category: true } },
  technician: { include: { user: { select: { id: true, name: true } } } },
  customer: { select: { id: true, name: true, email: true } },
  payment: true,
} satisfies Prisma.BookingInclude;

export const listAllBookings = async (query: ListBookingsQuery) => {
  const where: Prisma.BookingWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.customerId ? { customerId: query.customerId } : {}),
    ...(query.technicianId ? { technicianId: query.technicianId } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: adminBookingInclude,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};
