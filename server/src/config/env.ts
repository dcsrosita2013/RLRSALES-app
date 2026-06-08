import 'dotenv/config';

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const isProd = (process.env.NODE_ENV || 'development') === 'production';

export const env = {
  port: parseInt(process.env.PORT || '4000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL'),
  // In production a real secret is mandatory; in dev we fall back so it runs out-of-the-box.
  jwtSecret: required('JWT_SECRET', isProd ? undefined : 'dev-insecure-secret-change-me'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  backupDir: process.env.BACKUP_DIR || '../backups',
  // Printed on PDF documents (invoices, DRs, POs, vouchers, quotations).
  company: {
    name: process.env.COMPANY_NAME || 'RLR Sales and Services Corporation',
    address: process.env.COMPANY_ADDRESS || '156 Mataas na Lupa, Lipa City, Batangas',
    tin: process.env.COMPANY_TIN || '',
    phone: process.env.COMPANY_PHONE || '',
    telephone: process.env.COMPANY_TELEPHONE || process.env.COMPANY_PHONE || '(043) 773-5124',
    mobile: process.env.COMPANY_MOBILE || '0917-677-0068 / 0917-147-0123',
    email: process.env.COMPANY_EMAIL || '',
    // Optional path to a PNG/JPEG logo embedded on documents (e.g. ./assets/rlr-logo.png).
    logoPath: process.env.COMPANY_LOGO_PATH || '',
    // Signatory blocks printed at the bottom of the Purchase Order (overridable via env).
    signatories: {
      prepared: { name: process.env.PO_SIGN_PREPARED_NAME || '', title: process.env.PO_SIGN_PREPARED_TITLE || 'Account Executive' },
      checked: { name: process.env.PO_SIGN_CHECKED_NAME || '', title: process.env.PO_SIGN_CHECKED_TITLE || 'Warehouse' },
      noted: { name: process.env.PO_SIGN_NOTED_NAME || 'A.M. Robles', title: process.env.PO_SIGN_NOTED_TITLE || 'Sales & Operations Head' },
      approved: { name: process.env.PO_SIGN_APPROVED_NAME || 'Dra. Haydee J. Rosita', title: process.env.PO_SIGN_APPROVED_TITLE || 'Owner' },
    },
  },
};
