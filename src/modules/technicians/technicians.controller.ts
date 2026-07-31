import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/apiResponse';
import * as technicianService from './technicians.service';

interface ListTechniciansQuery {
  categoryId?: string;
  location?: string;
  minRating?: number;
  search?: string;
  page: number;
  limit: number;
}

export const getTechnicians = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListTechniciansQuery;
  const result = await technicianService.listTechnicians(query);
  sendSuccess(res, 200, 'Technicians fetched', result.items, {
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

export const getTechnician = catchAsync(async (req: Request, res: Response) => {
  const technician = await technicianService.getTechnicianById(req.params.id);
  sendSuccess(res, 200, 'Technician fetched', technician);
});

export const updateProfile = catchAsync(async (req: Request, res: Response) => {
  const profile = await technicianService.updateOwnProfile(req.user!.id, req.body);
  sendSuccess(res, 200, 'Profile updated', profile);
});

export const setAvailability = catchAsync(async (req: Request, res: Response) => {
  const slots = await technicianService.setOwnAvailability(req.user!.id, req.body.slots);
  sendSuccess(res, 200, 'Availability updated', slots);
});

export const getAvailability = catchAsync(async (req: Request, res: Response) => {
  const slots = await technicianService.getOwnAvailability(req.user!.id);
  sendSuccess(res, 200, 'Availability fetched', slots);
});

export const getAvailabilityForTechnician = catchAsync(async (req: Request, res: Response) => {
  const slots = await technicianService.getPublicAvailability(req.params.id);
  sendSuccess(res, 200, 'Availability fetched', slots);
});
