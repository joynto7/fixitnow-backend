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

app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'FixItNow API is running', data: null });
});

const openapiDocument = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openapiDocument));

app.use('/api', apiLimiter, apiRouter);

app.use(notFoundHandler);
app.use(errorHandler);
