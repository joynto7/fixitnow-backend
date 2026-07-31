import { z } from 'zod';

const bookingStatusEnum = z.enum([
  'REQUESTED',
  'ACCEPTED',
  'DECLINED',
  'PAID',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

export const createBookingSchema = z.object({
  body: z
    .object({
      serviceId: z.string().uuid('Invalid service id'),
      availabilitySlotId: z.string().uuid('Invalid availability slot id').optional(),
      scheduledDate: z.coerce.date().optional(),
      address: z.string().trim().min(5, 'Address is required').max(300),
      notes: z.string().trim().max(1000).optional(),
    })
    .refine((data) => data.availabilitySlotId || data.scheduledDate, {
      message: 'Select a time slot',
      path: ['availabilitySlotId'],
    }),
});

export const bookingIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid booking id') }),
});

export const listBookingsQuerySchema = z.object({
  query: z.object({
    status: bookingStatusEnum.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const updateTechnicianBookingStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid booking id') }),
  body: z.object({
    action: z.enum(['ACCEPT', 'DECLINE', 'START', 'COMPLETE']),
  }),
});
