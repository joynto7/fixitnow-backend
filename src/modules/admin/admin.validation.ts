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

export const listUsersQuerySchema = z.object({
  query: z.object({
    role: z.enum(['CUSTOMER', 'TECHNICIAN', 'ADMIN']).optional(),
    status: z.enum(['ACTIVE', 'BANNED']).optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});

export const updateUserStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid user id') }),
  body: z.object({
    status: z.enum(['ACTIVE', 'BANNED']),
  }),
});

export const listAdminBookingsQuerySchema = z.object({
  query: z.object({
    status: bookingStatusEnum.optional(),
    customerId: z.string().uuid().optional(),
    technicianId: z.string().uuid().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});
