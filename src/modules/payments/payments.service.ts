import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { Prisma, PaymentProvider, Role } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../../utils/AppError';
import { createStripeCheckoutSession, retrieveStripeSession } from './providers/stripe.provider';
import { createSslcommerzSession, validateSslcommerzPayment } from './providers/sslcommerz.provider';

const paymentInclude = {
  booking: {
    include: {
      service: true,
      customer: { select: { id: true, name: true, email: true } },
      technician: { include: { user: { select: { id: true, name: true } } } },
    },
  },
} satisfies Prisma.PaymentInclude;

type Metadata = Record<string, unknown>;

const asMetadata = (value: Prisma.JsonValue | null): Metadata =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Metadata) : {};

export const createPayment = async (
  customerId: string,
  data: { bookingId: string; provider: PaymentProvider }
) => {
  const booking = await prisma.booking.findUnique({
    where: { id: data.bookingId },
    include: { customer: true, service: true },
  });
  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }
  if (booking.customerId !== customerId) {
    throw new AppError(403, 'You can only pay for your own bookings');
  }
  if (booking.status !== 'ACCEPTED') {
    throw new AppError(
      400,
      `Booking must be accepted by the technician before payment (currently ${booking.status})`
    );
  }

  const existingPayment = await prisma.payment.findUnique({ where: { bookingId: booking.id } });
  if (existingPayment?.status === 'COMPLETED') {
    throw new AppError(409, 'This booking has already been paid for');
  }

  const transactionId = existingPayment?.transactionId ?? `FXN-${randomUUID()}`;
  const amount = Number(booking.price);

  let redirectUrl: string;
  let metadata: Metadata = {};

  if (data.provider === 'STRIPE') {
    const session = await createStripeCheckoutSession({
      transactionId,
      amount,
      description: booking.service.title,
      customerEmail: booking.customer.email,
      bookingId: booking.id,
    });
    redirectUrl = session.redirectUrl;
    metadata = { stripeSessionId: session.sessionId };
  } else {
    const session = await createSslcommerzSession({
      transactionId,
      amount,
      description: booking.service.title,
      customerName: booking.customer.name,
      customerEmail: booking.customer.email,
      customerPhone: booking.customer.phone ?? undefined,
    });
    redirectUrl = session.redirectUrl;
  }

  const payment = await prisma.payment.upsert({
    where: { bookingId: booking.id },
    create: {
      bookingId: booking.id,
      transactionId,
      amount: booking.price,
      provider: data.provider,
      status: 'PENDING',
      metadata: metadata as Prisma.InputJsonValue,
    },
    update: {
      transactionId,
      provider: data.provider,
      status: 'PENDING',
      metadata: metadata as Prisma.InputJsonValue,
    },
  });

  return { payment, redirectUrl };
};

const markPaymentCompleted = async (transactionId: string, metadata: Metadata) => {
  const payment = await prisma.payment.findUnique({ where: { transactionId } });
  if (!payment) {
    return null;
  }
  if (payment.status === 'COMPLETED') {
    return payment;
  }

  const [updatedPayment] = await prisma.$transaction([
    prisma.payment.update({
      where: { transactionId },
      data: {
        status: 'COMPLETED',
        paidAt: new Date(),
        metadata: { ...asMetadata(payment.metadata), ...metadata } as Prisma.InputJsonValue,
      },
    }),
    prisma.booking.update({ where: { id: payment.bookingId }, data: { status: 'PAID' } }),
  ]);
  return updatedPayment;
};

const markPaymentFailed = async (transactionId: string, metadata: Metadata = {}) => {
  const payment = await prisma.payment.findUnique({ where: { transactionId } });
  if (!payment || payment.status === 'COMPLETED') {
    return payment;
  }
  return prisma.payment.update({
    where: { transactionId },
    data: { status: 'FAILED', metadata: { ...asMetadata(payment.metadata), ...metadata } as Prisma.InputJsonValue },
  });
};

export const confirmPayment = async (bookingId: string, requester: { id: string; role: Role }) => {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { technician: { include: { user: { select: { id: true } } } } },
  });
  if (!booking) {
    throw new AppError(404, 'Booking not found');
  }
  const isCustomer = booking.customerId === requester.id;
  const isTechnician = booking.technician.user.id === requester.id;
  const isAdmin = requester.role === 'ADMIN';
  if (!isCustomer && !isTechnician && !isAdmin) {
    throw new AppError(403, 'You do not have access to this booking\'s payment');
  }

  const payment = await prisma.payment.findUnique({ where: { bookingId } });
  if (!payment) {
    throw new AppError(404, 'No payment found for this booking');
  }
  if (payment.status === 'COMPLETED') {
    return payment;
  }

  const metadata = asMetadata(payment.metadata);

  if (payment.provider === 'STRIPE') {
    const stripeSessionId = metadata.stripeSessionId as string | undefined;
    if (!stripeSessionId) {
      throw new AppError(400, 'Missing Stripe session reference for this payment');
    }
    const session = await retrieveStripeSession(stripeSessionId);
    if (session.payment_status !== 'paid') {
      throw new AppError(402, `Stripe reports payment status: ${session.payment_status}`);
    }
    const completed = await markPaymentCompleted(payment.transactionId, {
      stripeSessionId: session.id,
      stripePaymentStatus: session.payment_status,
    });
    return completed;
  }

  // SSLCOMMERZ: finalize using the val_id captured by the success/IPN callback.
  const valId = metadata.valId as string | undefined;
  if (!valId) {
    throw new AppError(
      402,
      'SSLCommerz has not confirmed this payment yet. Complete checkout via the redirect URL first.'
    );
  }
  const validation = await validateSslcommerzPayment(valId);
  if (validation.status !== 'VALID' && validation.status !== 'VALIDATED') {
    throw new AppError(402, `SSLCommerz reports payment status: ${validation.status ?? 'UNKNOWN'}`);
  }
  return markPaymentCompleted(payment.transactionId, { valId, sslValidationStatus: validation.status });
};

export const handleStripeReturn = async (sessionId: string) => {
  const session = await retrieveStripeSession(sessionId);
  const transactionId = session.metadata?.transactionId;
  const bookingId = session.metadata?.bookingId;
  if (!transactionId) {
    throw new AppError(400, 'Invalid or unrecognized Stripe session reference');
  }
  if (session.payment_status === 'paid') {
    await markPaymentCompleted(transactionId, {
      stripeSessionId: session.id,
      stripePaymentStatus: session.payment_status,
    });
    return { success: true, message: 'Payment successful, booking marked as PAID', bookingId };
  }
  return { success: false, message: `Payment not completed yet (status: ${session.payment_status})`, bookingId };
};

export const handleStripeWebhookEvent = async (event: Stripe.Event) => {
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const session = event.data.object as Stripe.Checkout.Session;
    const transactionId = session.metadata?.transactionId;
    if (transactionId && session.payment_status === 'paid') {
      await markPaymentCompleted(transactionId, {
        stripeSessionId: session.id,
        stripePaymentStatus: session.payment_status,
      });
    }
  }
};

export const handleSslcommerzCallback = async (body: Record<string, unknown>) => {
  const tranId = body.tran_id as string | undefined;
  const valId = body.val_id as string | undefined;
  if (!tranId || !valId) {
    throw new AppError(400, 'Missing tran_id/val_id in SSLCommerz callback');
  }

  const payment = await prisma.payment.findUnique({ where: { transactionId: tranId } });
  if (!payment) {
    throw new AppError(404, 'Payment not found for this transaction');
  }

  const validation = await validateSslcommerzPayment(valId);

  if (validation.status === 'VALID' || validation.status === 'VALIDATED') {
    return markPaymentCompleted(tranId, { valId, sslValidationStatus: validation.status });
  }
  return markPaymentFailed(tranId, { valId, sslValidationStatus: validation.status });
};

export const handleSslcommerzFailureCallback = async (body: Record<string, unknown>) => {
  const tranId = body.tran_id as string | undefined;
  if (!tranId) {
    return null;
  }
  return markPaymentFailed(tranId, { sslCallback: 'fail_or_cancel' });
};

export const listPaymentsForUser = async (userId: string, role: Role) => {
  let bookingFilter: Prisma.BookingWhereInput;
  if (role === 'TECHNICIAN') {
    const profile = await prisma.technicianProfile.findUnique({ where: { userId } });
    if (!profile) {
      throw new AppError(404, 'Technician profile not found');
    }
    bookingFilter = { technicianId: profile.id };
  } else {
    bookingFilter = { customerId: userId };
  }

  return prisma.payment.findMany({
    where: { booking: bookingFilter },
    include: paymentInclude,
    orderBy: { createdAt: 'desc' },
  });
};

export const getPaymentForUser = async (paymentId: string, requester: { id: string; role: Role }) => {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
  if (!payment) {
    throw new AppError(404, 'Payment not found');
  }

  const isCustomer = payment.booking.customerId === requester.id;
  const isTechnician = payment.booking.technician.user.id === requester.id;
  const isAdmin = requester.role === 'ADMIN';
  if (!isCustomer && !isTechnician && !isAdmin) {
    throw new AppError(403, 'You do not have access to this payment');
  }
  return payment;
};
