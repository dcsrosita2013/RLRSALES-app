import { Router } from 'express';
import { Role } from '@prisma/client';
import { asyncHandler, ApiError } from '../../middleware/error';
import { prisma } from '../../lib/prisma';
import * as r from './reports.service';
import { reportToBuffer } from './reports.excel';

const router = Router();

interface ReportDef {
  label: string;
  roles: Role[];
  filters: string[]; // dateRange | customer | agent | supplier | product | collectionStatus
  run: (f: r.ReportFilters) => Promise<r.ReportResult>;
}

const REPORTS: Record<string, ReportDef> = {
  'sales-detailed': { label: 'Sales — Detailed', roles: ['ADMIN', 'AGENT', 'FINANCE'], filters: ['dateRange', 'agent'], run: r.salesDetailed },
  'sales-summary': { label: 'Sales — Summary (Profit)', roles: ['ADMIN', 'FINANCE'], filters: ['dateRange', 'agent'], run: r.salesSummary },
  collections: { label: 'Collections', roles: ['ADMIN', 'FINANCE'], filters: ['dateRange', 'customer'], run: r.collectionsReport },
  'customer-ledger': { label: 'Customer Ledger', roles: ['ADMIN', 'FINANCE'], filters: ['dateRange', 'customer'], run: r.customerLedger },
  'purchase-detailed': { label: 'Purchases — Detailed', roles: ['ADMIN', 'WAREHOUSE', 'FINANCE'], filters: ['dateRange', 'supplier'], run: r.purchaseDetailed },
  'product-ledger': { label: 'Product Ledger', roles: ['ADMIN', 'WAREHOUSE', 'AGENT'], filters: ['dateRange', 'product'], run: r.productLedger },
  inventory: { label: 'Inventory — On Hand', roles: ['ADMIN', 'WAREHOUSE', 'AGENT'], filters: [], run: () => r.inventoryReport() },
  'customers-per-agent': { label: 'Customers per Agent', roles: ['ADMIN', 'AGENT'], filters: ['agent'], run: r.customersPerAgent },
  'sales-per-agent': { label: 'Sales Summary per Agent', roles: ['ADMIN', 'FINANCE'], filters: ['dateRange'], run: r.salesPerAgent },
  quotations: { label: 'Quotations', roles: ['ADMIN', 'AGENT'], filters: ['dateRange'], run: r.quotationsReport },
  'purchase-orders': { label: 'Purchase Orders', roles: ['ADMIN', 'WAREHOUSE', 'FINANCE'], filters: ['dateRange', 'supplier'], run: r.purchaseOrdersReport },
  'agent-commission': { label: 'Agent Commission', roles: ['ADMIN'], filters: ['dateRange', 'agent'], run: r.agentCommission },
  'agent-commission-detailed': { label: 'Agent Commission — Detailed', roles: ['ADMIN'], filters: ['dateRange', 'agent'], run: r.agentCommissionDetailed },
  receivables: { label: 'Collections Status (Receivables)', roles: ['ADMIN', 'FINANCE'], filters: ['dateRange', 'customer', 'collectionStatus', 'agent'], run: r.receivablesStatus },
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const role = req.user!.role;
    res.json(
      Object.entries(REPORTS)
        .filter(([, d]) => d.roles.includes(role))
        .map(([key, d]) => ({ key, label: d.label, filters: d.filters })),
    );
  }),
);

router.get(
  '/:type',
  asyncHandler(async (req, res) => {
    const def = REPORTS[req.params.type];
    if (!def) throw new ApiError(404, 'Unknown report');
    if (!def.roles.includes(req.user!.role)) throw new ApiError(403, 'You do not have access to this report');

    const q = (k: string) => {
      const v = req.query[k];
      return typeof v === 'string' && v ? v : undefined;
    };
    const filters: r.ReportFilters = {
      dateFrom: q('dateFrom'),
      dateTo: q('dateTo'),
      customerId: q('customerId'),
      agentId: q('agentId'),
      supplierId: q('supplierId'),
      productId: q('productId'),
      status: q('status'),
      canSeeCost: req.user!.role !== 'AGENT',
    };
    // Agents may only ever see their own sales/quotes/customers — never another
    // agent's. Resolve their linked agent and force the self-scope server-side.
    if (req.user!.role === 'AGENT') {
      const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { agentId: true } });
      filters.agentId = undefined;
      filters.selfUserId = req.user!.id;
      filters.selfAgentId = u?.agentId ?? null;
    }
    const result = await def.run(filters);

    if (req.query.format === 'excel') {
      const buf = await reportToBuffer(result);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${req.params.type}.xlsx"`);
      res.send(buf);
      return;
    }
    res.json(result);
  }),
);

export default router;
