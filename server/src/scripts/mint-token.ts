import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { signToken } from '../lib/jwt';

// Dev helper: prints a valid JWT for the given username(s) without needing the
// password — used by smoke tests so they never disturb real account passwords.
//   npx tsx src/scripts/mint-token.ts admin agent1 finance
const prisma = new PrismaClient();

async function main() {
  const usernames = process.argv.slice(2);
  for (const username of usernames) {
    const u = await prisma.user.findUnique({ where: { username } });
    if (u) {
      // eslint-disable-next-line no-console
      console.log(`${username}\t${signToken({ sub: u.id, username: u.username, role: u.role, fullName: u.fullName })}`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
