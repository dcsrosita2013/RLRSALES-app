import 'dotenv/config';
import { PrismaClient, Role, VatClass, TermsType, Floor, DocType } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = process.env.SEED_DEFAULT_PASSWORD || 'Rlr@Temp2026';

async function main() {
  console.log('Seeding RLR database...');

  // ---- Document number sequences (configurable prefix + start) ----
  const sequences: { docType: DocType; prefix: string }[] = [
    { docType: DocType.INVOICE, prefix: 'INV-' },
    { docType: DocType.DELIVERY_RECEIPT, prefix: 'DR-' },
    { docType: DocType.PURCHASE_ORDER, prefix: 'PO-' },
    { docType: DocType.CHECK_VOUCHER, prefix: 'CV-' },
    { docType: DocType.QUOTATION, prefix: 'QTN-' },
    { docType: DocType.COLLECTION, prefix: 'COL-' },
  ];
  for (const s of sequences) {
    await prisma.documentSequence.upsert({
      where: { docType: s.docType },
      update: {}, // don't reset an existing live counter
      create: { docType: s.docType, prefix: s.prefix, nextNumber: 1, padding: 5 },
    });
  }

  // ---- Categories ----
  const categoryNames = ['Industrial', 'Bearings', 'Tools', 'Fasteners', 'Lubricants'];
  const categories: Record<string, string> = {};
  for (const name of categoryNames) {
    const c = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    categories[name] = c.id;
  }

  // ---- Brands ----
  const brandNames = ['SKF', 'NSK', 'Timken', 'Generic'];
  const brands: Record<string, string> = {};
  for (const name of brandNames) {
    const b = await prisma.brand.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    brands[name] = b.id;
  }

  // ---- Agent ----
  const agent = await prisma.agent.upsert({
    where: { id: 'seed-agent-1' },
    update: {},
    create: {
      id: 'seed-agent-1',
      name: 'Juan Dela Cruz',
      address: 'Quezon City, Metro Manila',
      contactNumber: '0917-123-4567',
    },
  });

  // ---- Users: one per role, force password change on first login ----
  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 10);
  const users: { username: string; fullName: string; role: Role; agentId?: string }[] = [
    { username: 'admin', fullName: 'System Administrator', role: Role.ADMIN },
    { username: 'agent1', fullName: 'Juan Dela Cruz', role: Role.AGENT, agentId: agent.id },
    { username: 'warehouse', fullName: 'Warehouse Staff', role: Role.WAREHOUSE },
    { username: 'finance', fullName: 'Finance / Collections', role: Role.FINANCE },
  ];
  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: { fullName: u.fullName, role: u.role, agentId: u.agentId ?? null },
      create: {
        username: u.username,
        fullName: u.fullName,
        role: u.role,
        passwordHash,
        mustChangePassword: true,
        agentId: u.agentId ?? null,
      },
    });
  }

  // ---- Customer ----
  await prisma.customer.upsert({
    where: { id: 'seed-customer-1' },
    update: {},
    create: {
      id: 'seed-customer-1',
      name: 'ABC Manufacturing Inc.',
      address: '123 Industrial Ave, Valenzuela City',
      tin: '009-123-456-000',
      contactNumber: '02-8123-4567',
      vatClass: VatClass.VAT,
      agentId: agent.id,
    },
  });

  // ---- Supplier ----
  await prisma.supplier.upsert({
    where: { id: 'seed-supplier-1' },
    update: {},
    create: {
      id: 'seed-supplier-1',
      name: 'Prime Bearings Supply Co.',
      address: '456 Tradeline St, Caloocan City',
      tin: '008-987-654-000',
      contactNumber: '02-8765-4321',
      termsType: TermsType.NET,
      netDays: 30,
    },
  });

  // ---- Products + stock locations ----
  const products: {
    id: string;
    name: string;
    description: string;
    category: string;
    brand: string;
    unit: string;
    cost: number;
    floor: Floor;
    room: string;
    qty: number;
  }[] = [
    {
      id: 'seed-prod-6204',
      name: 'Deep Groove Ball Bearing 6204-2RS',
      description: '20x47x14mm sealed ball bearing',
      category: 'Bearings',
      brand: 'SKF',
      unit: 'pc',
      cost: 120,
      floor: Floor.FIRST,
      room: '101',
      qty: 50,
    },
    {
      id: 'seed-prod-6205',
      name: 'Deep Groove Ball Bearing 6205-2RS',
      description: '25x52x15mm sealed ball bearing',
      category: 'Bearings',
      brand: 'NSK',
      unit: 'pc',
      cost: 150,
      floor: Floor.SECOND,
      room: '210',
      qty: 30,
    },
    {
      id: 'seed-prod-grease',
      name: 'Industrial Lithium Grease 1kg',
      description: 'Multi-purpose EP2 lithium grease',
      category: 'Lubricants',
      brand: 'Generic',
      unit: 'can',
      cost: 250,
      floor: Floor.FIRST,
      room: '105',
      qty: 20,
    },
    {
      id: 'seed-prod-wrench',
      name: 'Adjustable Wrench 12"',
      description: 'Chrome vanadium adjustable wrench',
      category: 'Tools',
      brand: 'Generic',
      unit: 'pc',
      cost: 320,
      floor: Floor.SECOND,
      room: '201',
      qty: 15,
    },
  ];

  for (const p of products) {
    const basePrice = Math.round(p.cost * 1.3 * 100) / 100; // default +30%
    await prisma.product.upsert({
      where: { id: p.id },
      update: {},
      create: {
        id: p.id,
        name: p.name,
        description: p.description,
        categoryId: categories[p.category],
        brandId: brands[p.brand],
        unit: p.unit,
        costPrice: p.cost,
        basePrice,
      },
    });
    await prisma.stockLocation.upsert({
      where: {
        productId_floor_roomNumber: {
          productId: p.id,
          floor: p.floor,
          roomNumber: p.room,
        },
      },
      update: {},
      create: {
        productId: p.id,
        floor: p.floor,
        roomNumber: p.room,
        quantity: p.qty,
      },
    });
  }

  console.log('Seed complete.');
  console.log('---------------------------------------------');
  console.log('Login accounts (temporary password for all):');
  console.log(`  Password: ${DEFAULT_PASSWORD}  (must change on first login)`);
  console.log('  admin      -> ADMIN / Owner');
  console.log('  agent1     -> AGENT (Sales)');
  console.log('  warehouse  -> WAREHOUSE');
  console.log('  finance    -> FINANCE / Collections');
  console.log('---------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
