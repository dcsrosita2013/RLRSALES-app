import { app } from './app';
import { env } from './config/env';
import { runBackup } from './lib/backup';

// Local / self-hosted entry point. On Vercel the app is served by api/index.ts
// (serverless), so this file's listen() + scheduled backup do not run there.
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
