import { Request, Response } from 'express';
import { Role, UserStatus, BookingStatus } from '@prisma/client';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/apiResponse';
import * as adminService from './admin.service';

interface ListUsersQuery {
  role?: Role;
  status?: UserStatus;
  page: number;
  limit: number;
}

interface ListBookingsQuery {
  status?: BookingStatus;
  customerId?: string;
  technicianId?: string;
  page: number;
  limit: number;
}

export const getPlatformStats = catchAsync(async (_req: Request, res: Response) => {
  const stats = await adminService.getPlatformStats();
  sendSuccess(res, 200, 'Platform stats fetched', stats);
});

export const getUsers = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListUsersQuery;
  const result = await adminService.listUsers(query);
  sendSuccess(res, 200, 'Users fetched', result.items, {
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

export const updateUserStatus = catchAsync(async (req: Request, res: Response) => {
  const user = await adminService.updateUserStatus(req.user!.id, req.params.id, req.body.status);
  sendSuccess(res, 200, 'User status updated', user);
});

export const getAllBookings = catchAsync(async (req: Request, res: Response) => {
  const query = req.query as unknown as ListBookingsQuery;
  const result = await adminService.listAllBookings(query);
  sendSuccess(res, 200, 'Bookings fetched', result.items, {
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});
