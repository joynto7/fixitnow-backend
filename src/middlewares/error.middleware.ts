import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import jwt from 'jsonwebtoken';
import { MulterError } from 'multer';
import { AppError } from '../utils/AppError';
import { config } from '../config/env';

const handleZodError = (err: ZodError) => {
  const errorDetails = err.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
  return new AppError(400, 'Validation failed', errorDetails);
};

const handlePrismaError = (err: Prisma.PrismaClientKnownRequestError) => {
  switch (err.code) {
    case 'P2002': {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return new AppError(409, `A record with this ${target} already exists`);
    }
    case 'P2025':
      return new AppError(404, 'Record not found');
    case 'P2003':
      return new AppError(400, 'Invalid reference to a related record');
    default:
      return new AppError(400, 'Database request could not be processed');
  }
};

// Express only treats a middleware as an error handler when it has 4 params,
// so req/next stay in the signature even though this handler doesn't use them.
export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  let error = err;

  if (error instanceof ZodError) {
    error = handleZodError(error);
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    error = handlePrismaError(error);
  } else if (error instanceof Prisma.PrismaClientValidationError) {
    error = new AppError(400, 'Invalid data provided to database query');
  } else if (error instanceof jwt.TokenExpiredError) {
    error = new AppError(401, 'Session expired, please log in again');
  } else if (error instanceof jwt.JsonWebTokenError) {
    error = new AppError(401, 'Invalid authentication token');
  } else if (error instanceof MulterError) {
    error = new AppError(400, error.code === 'LIMIT_FILE_SIZE' ? 'File is too large' : error.message);
  }

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      errorDetails: error.errorDetails ?? null,
    });
  }

  const message = error instanceof Error ? error.message : 'Something went wrong';
  if (!config.isProduction) {
    console.error(err);
  }

  return res.status(500).json({
    success: false,
    message: config.isProduction ? 'Internal server error' : message,
    errorDetails: config.isProduction ? null : error instanceof Error ? error.stack : error,
  });
};
