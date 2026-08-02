import { z } from 'zod';

export const createServiceSchema = z.object({
  body: z.object({
    title: z.string().trim().min(2, 'Title must be at least 2 characters').max(150),
    description: z.string().trim().max(2000).optional(),
    price: z.number().positive('Price must be a positive number'),
    categoryId: z.string().uuid('Invalid category id'),
  }),
});

export const updateServiceSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid service id') }),
  body: z.object({
    title: z.string().trim().min(2).max(150).optional(),
    description: z.string().trim().max(2000).optional(),
    price: z.number().positive().optional(),
    categoryId: z.string().uuid('Invalid category id').optional(),
  }),
});

export const serviceIdParamSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid service id') }),
});

export const serviceMediaParamSchema = z.object({
  params: z.object({
    id: z.string().uuid('Invalid service id'),
    mediaId: z.string().uuid('Invalid media id'),
  }),
});

export const listServicesQuerySchema = z.object({
  query: z.object({
    categoryId: z.string().uuid().optional(),
    technicianId: z.string().uuid().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    search: z.string().trim().optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  }),
});
