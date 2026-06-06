import 'dotenv/config';
import { runBackup } from '../lib/backup';
import { prisma } from '../lib/prisma';

// Manual DB backup. Restore with:
//   psql "<DATABASE_URL>" -f <backup-file>
//   docker exec -i rlr_postgres psql -U <user> -d <db> < <backup-file>
runBackup()
  .then((b) => {
    // eslint-disable-next-line no-console
    console.log(`Backup written: ${b.path} (${b.sizeBytes.toLocaleString()} bytes)`);
  })
  .catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
