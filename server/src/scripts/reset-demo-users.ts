import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Non-destructive helper: restores the four demo accounts to the temporary
// password and re-arms the "must change password on next login" flag.
// Useful after testing, or to hand a fresh set of demo logins to staff.
const prisma = new PrismaClient();
const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'Rlr@Temp2026';

async function main() {
  const usernames = ['admin', 'agent1', 'warehouse', 'finance'];
  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);

  for (const username of usernames) {
    const updated = await prisma.user
      .update({
        where: { username },
        data: { passwordHash, mustChangePassword: true },
      })
      .catch(() => null);
    // eslint-disable-next-line no-console
    console.log(updated ? `Reset ${username}` : `Skipped ${username} (not found)`);
  }
  // eslint-disable-next-line no-console
  console.log(`Demo users reset to temporary password: ${DEFAULT_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
