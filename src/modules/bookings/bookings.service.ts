import { Prisma, BookingStatus, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';

const bookingInclude = {
  service: { include: { category: true } },
  technician: { include: { user: { select: { id: true, name: true, phone: true } } } },
  customer: { select: { id: true, name: true, email: true, phone: true } },
  payment: true,
} satisfies Prisma.BookingInclude;

interface CreateBookingInput {
  serviceId: string;
  availabilitySlotId?: string;
  scheduledDate?: Date;
  address: string;
  notes?: string;
}

interface ListQuery {
  status?: BookingStatus;
  page: number;
  limit: number;
}

// Availability.date is a @db.Date (midnight UTC); startTime is "HH:mm".
const combineDateAndTime = (date: Date, time: string): Date => {
  const [hours, minutes] = time.split(':').map(Number);
  const combined = new Date(date);
  combined.setUTCHours(hours, minutes, 0, 0);
  return combined;
};

export const createBooking = async (customerId: string, data: CreateBookingInput) => {
  const service = await prisma.service.findFirst({
    where: { id: data.serviceId, technician: { user: { status: 'ACTIVE' } } },
  });
  if (!service) {
    throw new AppError(404, 'Service not found');
  }

  if (data.availabilitySlotId) {
    return prisma.$transaction(async (tx) => {
      const slot = await tx.availability.findUnique({ where: { id: data.availabilitySlotId } });
      if (!slot || slot.technicianId !== service.technicianId) {
        throw new AppError(404, 'Availability slot not found for this technician');
      }
      // Conditional update, not a separate isBooked check: this is what makes
      // two concurrent bookings for the same slot race-safe instead of both
      // reading isBooked=false and both succeeding.
      const claimed = await tx.availability.updateMany({
        where: { id: slot.id, isBooked: false },
        data: { isBooked: true },
      });
      if (claimed.count === 0) {
        throw new AppError(409, 'This time slot has already been booked');
      }
      return tx.booking.create({
        data: {
          customerId,
          technicianId: service.technicianId,
          serviceId: service.id,
          availabilitySlotId: slot.id,
          scheduledDate: combineDateAndTime(slot.date, slot.startTime),
          address: data.address,
          notes: data.notes,
          price: service.price,
          status: 'REQUESTED',
        },
        include: bookingInclude,
      });
    });
  }

  if (!data.scheduledDate) {
    throw new AppError(400, 'Select a time slot');
  }
  return prisma.booking.create({
    data: {
      customerId,
      technicianId: service.technicianId,
      serviceId: service.id,
      scheduledDate: data.scheduledDate,
      address: data.address,
      notes: data.notes,
      price: service.price,
      status: 'REQUESTED',
    },
    include: bookingInclude,
  });
};

const freeAvailabilitySlot = (tx: Prisma.TransactionClient, availabilitySlotId: string | null) =>
  availabilitySlotId
    ? tx.availability.update({ where: { id: availabilitySlotId }, data: { isBooked: false } })
    : Promise.resolve();

export const listCustomerBookings = async (customerId: string, query: ListQuery) => {
  const where: Prisma.BookingWhereInput = {
    customerId,
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};

export const listTechnicianBookings = async (userId: string, query: ListQuery) => {
  const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, 'Technician profile not found');
  }
  const where: Prisma.BookingWhereInput = {
    technicianId: profile.id,
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: bookingInclude,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, total, page: query.page, limit: query.limit };
};

export const getBookingForUser = async (bookingId: string, requester: { id: string; role: Role }) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: bookingInclude });
  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }

  const isCustomer = booking.customerId === requester.id;
  const isTechnician = booking.technician.user.id === requester.id;
  const isAdmin = requester.role === 'ADMIN';

  if (!isCustomer && !isTechnician && !isAdmin) {
    throw new AppError(403, 'You do not have access to this booking');
  }
  return booking;
};

const CANCELLABLE_STATUSES: BookingStatus[] = ['REQUESTED', 'ACCEPTED', 'PAID'];

export const cancelBooking = async (bookingId: string, customerId: string) => {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }
  if (booking.customerId !== customerId) {
    throw new AppError(403, 'You can only cancel your own bookings');
  }
  if (!CANCELLABLE_STATUSES.includes(booking.status)) {
    throw new AppError(400, `A booking that is ${booking.status} can no longer be cancelled`);
  }
  return prisma.$transaction(async (tx) => {
    await freeAvailabilitySlot(tx, booking.availabilitySlotId);
    return tx.booking.update({
      where: { id: bookingId },
      // Clear our own FK too, not just the slot's isBooked flag: it's @unique,
      // so leaving it set would permanently block that slot from ever being
      // booked again by anyone.
      data: { status: 'CANCELLED', availabilitySlotId: null },
      include: bookingInclude,
    });
  });
};

type TechnicianAction = 'ACCEPT' | 'DECLINE' | 'START' | 'COMPLETE';

const TECHNICIAN_TRANSITIONS: Record<TechnicianAction, { from: BookingStatus[]; to: BookingStatus }> = {
  ACCEPT: { from: ['REQUESTED'], to: 'ACCEPTED' },
  DECLINE: { from: ['REQUESTED'], to: 'DECLINED' },
  START: { from: ['PAID'], to: 'IN_PROGRESS' },
  COMPLETE: { from: ['IN_PROGRESS'], to: 'COMPLETED' },
};

export const updateBookingStatusByTechnician = async (
  bookingId: string,
  userId: string,
  action: TechnicianAction
) => {
  const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
  if (!profile) {
    throw new AppError(404, 'Technician profile not found');
  }

  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }
  if (booking.technicianId !== profile.id) {
    throw new AppError(403, 'You can only manage your own bookings');
  }

  const transition = TECHNICIAN_TRANSITIONS[action];
  if (!transition.from.includes(booking.status)) {
    throw new AppError(400, `Cannot ${action.toLowerCase()} a booking that is currently ${booking.status}`);
  }

  return prisma.$transaction(async (tx) => {
    if (action === 'DECLINE') {
      await freeAvailabilitySlot(tx, booking.availabilitySlotId);
    }
    return tx.booking.update({
      where: { id: bookingId },
      data: {
        status: transition.to,
        // Same @unique-FK reasoning as cancelBooking: only clear it on DECLINE
        // (the terminal, slot-freeing transition), not on ACCEPT/START/COMPLETE.
        ...(action === 'DECLINE' ? { availabilitySlotId: null } : {}),
      },
      include: bookingInclude,
    });
  });
};
