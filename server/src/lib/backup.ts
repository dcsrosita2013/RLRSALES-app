import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { env } from '../config/env';
import { prisma } from './prisma';

export interface BackupResult {
  filename: string;
  path: string;
  sizeBytes: number;
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

// Creates a timestamped SQL dump in BACKUP_DIR and records it in the Backup table.
// Tries a local `pg_dump`, then falls back to the docker-compose container.
export async function runBackup(createdById?: string | null): Promise<BackupResult> {
  const backupDir = path.resolve(process.cwd(), env.backupDir);
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const filename = `rlr-backup-${timestamp()}.sql`;
  const outFile = path.join(backupDir, filename);

  try {
    execFileSync('pg_dump', ['--dbname', env.databaseUrl, '--no-owner', '--no-privileges', '--file', outFile], { stdio: 'pipe' });
  } catch {
    const user = process.env.POSTGRES_USER || 'rlr';
    const db = process.env.POSTGRES_DB || 'rlr_db';
    const dump = execFileSync('docker', ['exec', 'rlr_postgres', 'pg_dump', '-U', user, '-d', db, '--no-owner', '--no-privileges']);
    writeFileSync(outFile, dump);
  }

  const sizeBytes = statSync(outFile).size;
  await prisma.backup.create({ data: { filename, sizeBytes, createdById: createdById ?? null } });
  return { filename, path: outFile, sizeBytes };
}
