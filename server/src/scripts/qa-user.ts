import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Throwaway QA login for verification/testing. Does NOT touch the seeded accounts.
//   npx tsx src/scripts/qa-user.ts          -> create/refresh user "qa" (no forced change)
//   npx tsx src/scripts/qa-user.ts delete   -> remove it
const prisma = new PrismaClient();
const action = process.argv[2] || 'create';

async function main() {
  if (action === 'delete') {
    await prisma.user.deleteMany({ where: { username: 'qa' } });
    // eslint-disable-next-line no-console
    console.log('qa user deleted');
    return;
  }
  const passwordHash = bcrypt.hashSync('Qa@Verify2026', 10);
  await prisma.user.upsert({
    where: { username: 'qa' },
    update: { passwordHash, mustChangePassword: false, isActive: true, role: 'ADMIN' },
    create: { username: 'qa', fullName: 'QA Verifier', role: 'ADMIN', passwordHash, mustChangePassword: false },
  });
  // eslint-disable-next-line no-console
  console.log('qa user ready: qa / Qa@Verify2026 (ADMIN, no forced change)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
