import { Request, Response } from 'express';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import * as serviceService from './services.service';

interface ListServicesQuery {
  categoryId?: string;
  technicianId?: string;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  page: number;
  limit: number;
}

export const getServices = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListServicesQuery;
  const result = await serviceService.listServices(query);
  sendSuccess(res, 200, 'Services fetched', result.items, {
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

export const getService = catchAsync(async (req: Request, res: Response) => {
  const service = await serviceService.getServiceById(req.params.id);
  sendSuccess(res, 200, 'Service fetched', service);
});

export const createService = catchAsync(async (req: Request, res: Response) => {
  const service = await serviceService.createService(req.user!.id, req.body);
  sendSuccess(res, 201, 'Service created', service);
});

export const updateService = catchAsync(async (req: Request, res: Response) => {
  const service = await serviceService.updateService(req.user!.id, req.params.id, req.body);
  sendSuccess(res, 200, 'Service updated', service);
});

export const deleteService = catchAsync(async (req: Request, res: Response) => {
  await serviceService.deleteService(req.user!.id, req.params.id);
  sendSuccess(res, 200, 'Service deleted', null);
});

export const uploadServiceMedia = catchAsync(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError(400, 'No file uploaded');
  }
  const media = await serviceService.addServiceMedia(req.user!.id, req.params.id, req.file);
  sendSuccess(res, 201, 'Media uploaded', media);
});

export const deleteServiceMedia = catchAsync(async (req: Request, res: Response) => {
  await serviceService.removeServiceMedia(req.user!.id, req.params.id, req.params.mediaId);
  sendSuccess(res, 200, 'Media deleted', null);
});
