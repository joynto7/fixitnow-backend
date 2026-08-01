import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/role.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { uploadPhoto } from '../../middlewares/upload.middleware';
import {
  updateTechnicianProfileSchema,
  setAvailabilitySchema,
  technicianIdParamSchema,
  listTechniciansQuerySchema,
} from './technicians.validation';
import {
  getTechnicians,
  getTechnician,
  updateProfile,
  uploadProfilePhoto,
  setAvailability,
  getAvailability,
  getAvailabilityForTechnician,
} from './technicians.controller';

export const technicianPublicRouter = Router();
technicianPublicRouter.get('/', validate(listTechniciansQuerySchema), getTechnicians);
technicianPublicRouter.get('/:id', validate(technicianIdParamSchema), getTechnician);
technicianPublicRouter.get(
  '/:id/availability',
  validate(technicianIdParamSchema),
  getAvailabilityForTechnician
);

export const technicianSelfRouter = Router();
technicianSelfRouter.use(authenticate, authorize('TECHNICIAN'));
technicianSelfRouter.put('/profile', validate(updateTechnicianProfileSchema), updateProfile);
technicianSelfRouter.post('/profile/photo', uploadPhoto, uploadProfilePhoto);
technicianSelfRouter.put('/availability', validate(setAvailabilitySchema), setAvailability);
technicianSelfRouter.get('/availability', getAvailability);
