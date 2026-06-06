import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import apiRoutes from './routes';
import { errorHandler, notFound } from './middleware/error';
import { runBackup } from './lib/backup';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.clientUrl, credentials: true }));
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

app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`RLR API running on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Optional scheduled DB backup: set BACKUP_INTERVAL_HOURS in .env (e.g. 24).
const backupHours = parseInt(process.env.BACKUP_INTERVAL_HOURS || '0', 10);
if (backupHours > 0) {
  setInterval(
    () => {
      runBackup()
        // eslint-disable-next-line no-console
        .then((b) => console.log(`Scheduled backup written: ${b.filename}`))
        // eslint-disable-next-line no-console
        .catch((e) => console.error('Scheduled backup failed:', e?.message ?? e));
    },
    backupHours * 60 * 60 * 1000,
  );
  // eslint-disable-next-line no-console
  console.log(`Scheduled backups every ${backupHours}h enabled.`);
}
