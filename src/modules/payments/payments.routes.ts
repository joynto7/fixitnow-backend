import { Router } from 'express';
import { authenticate } from '../../middlewares/auth.middleware';
import { authorize } from '../../middlewares/role.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { createPaymentSchema, confirmPaymentSchema, paymentIdParamSchema } from './payments.validation';
import {
  createPayment,
  confirmPayment,
  getPayments,
  getPayment,
  stripeReturn,
  sslcommerzSuccess,
  sslcommerzFail,
  sslcommerzCancel,
  sslcommerzIpn,
} from './payments.controller';

export const paymentRouter = Router();

paymentRouter.post('/create', authenticate, authorize('CUSTOMER'), validate(createPaymentSchema), createPayment);
paymentRouter.post('/confirm', authenticate, validate(confirmPaymentSchema), confirmPayment);
paymentRouter.get('/', authenticate, getPayments);

// Provider redirect/callback endpoints are hit by the browser or the gateway's
// server, not by our own authenticated client, so they stay unauthenticated.
paymentRouter.get('/stripe/return', stripeReturn);
paymentRouter.all('/sslcommerz/success', sslcommerzSuccess);
paymentRouter.all('/sslcommerz/fail', sslcommerzFail);
paymentRouter.all('/sslcommerz/cancel', sslcommerzCancel);
paymentRouter.post('/ipn/sslcommerz', sslcommerzIpn);

paymentRouter.get('/:id', authenticate, validate(paymentIdParamSchema), getPayment);
