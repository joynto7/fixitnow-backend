import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/role.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { listUsersQuerySchema, updateUserStatusSchema, listAdminBookingsQuerySchema } from './admin.validation';
import { getUsers, updateUserStatus, getAllBookings, getPlatformStats } from './admin.controller';

export const adminRouter = Router();
adminRouter.use(authenticate, authorize('ADMIN'));
adminRouter.get('/stats', getPlatformStats);
adminRouter.get('/users', validate(listUsersQuerySchema), getUsers);
adminRouter.patch('/users/:id', validate(updateUserStatusSchema), updateUserStatus);
adminRouter.get('/bookings', validate(listAdminBookingsQuerySchema), getAllBookings);
