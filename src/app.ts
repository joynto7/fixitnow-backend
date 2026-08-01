import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import { config } from './config/env';
import { apiRouter } from './routes';
import { stripeWebhookHandler } from './modules/payments/payments.controller';
import { notFoundHandler } from './middlewares/notFound.middleware';
import { errorHandler } from './middlewares/error.middleware';
import { apiLimiter } from './middlewares/rateLimit.middleware';

export const app = express();

// CSP is disabled because it blocks Swagger UI's inline scripts/styles at /api-docs.
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
if (!config.isProduction) {
  app.use(morgan('dev'));
}

// Stripe webhooks must see the raw request body to verify the signature,
// so this route is registered before the global express.json() parser.
app.post('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }), stripeWebhookHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// helmet's default Cross-Origin-Resource-Policy (same-origin) would block the
// frontend, on a different origin, from embedding these — they're meant to be
// public, so relax it just for this one route rather than for the whole app.
app.use(
  '/uploads',
  (_req: Request, res: Response, next: express.NextFunction) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.join(__dirname, '../uploads'))
);

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'FixItNow API is running', data: null });
});

const openapiDocument = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.use('/api', apiLimiter, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
