import express from 'express';
import cors, { CorsOptions } from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import apiRoutes from './routes';
import { errorHandler, notFound } from './middleware/error';

// Allow the configured frontend, any *.vercel.app deployment, and local dev.
const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true); // curl / server-to-server / same-origin
    try {
      const host = new URL(origin).hostname;
      const allowed =
        origin === env.clientUrl ||
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.vercel.app');
      return callback(null, allowed);
    } catch {
      return callback(null, false);
    }
  },
  credentials: true,
};

// Builds the configured Express app WITHOUT starting a server, so it can run both
// as a long-running process (local dev) and as a Vercel serverless function.
export function createApp() {
  const app = express();
  app.use(helmet());
  app.use(cors(corsOptions));
  app.use(express.json({ limit: '2mb' }));

  if (env.nodeEnv === 'development') {
    app.use((req, _res, next) => {
      // eslint-disable-next-line no-console
      console.log(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  app.use('/api', apiRoutes);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}

export const app = createApp();
export default app;
