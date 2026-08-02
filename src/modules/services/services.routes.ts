import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/role.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uploadMedia } from '../../middlewares/upload.middleware';
import {
  createServiceSchema,
  updateServiceSchema,
  serviceIdParamSchema,
  serviceMediaParamSchema,
  listServicesQuerySchema,
} from './services.validation';
import {
  getServices,
  getService,
  createService,
  updateService,
  deleteService,
  uploadServiceMedia,
  deleteServiceMedia,
} from './services.controller';

export const serviceRouter = Router();

serviceRouter.get('/', validate(listServicesQuerySchema), getServices);
serviceRouter.get('/:id', validate(serviceIdParamSchema), getService);
serviceRouter.post('/', authenticate, authorize('TECHNICIAN'), validate(createServiceSchema), createService);
serviceRouter.put('/:id', authenticate, authorize('TECHNICIAN'), validate(updateServiceSchema), updateService);
serviceRouter.delete('/:id', authenticate, authorize('TECHNICIAN'), validate(serviceIdParamSchema), deleteService);
serviceRouter.post(
  '/:id/media',
  authenticate,
  authorize('TECHNICIAN'),
  validate(serviceIdParamSchema),
  uploadMedia,
  uploadServiceMedia
);
serviceRouter.delete(
  '/:id/media/:mediaId',
  authenticate,
  authorize('TECHNICIAN'),
  validate(serviceMediaParamSchema),
  deleteServiceMedia
);
