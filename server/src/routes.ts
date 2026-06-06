import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import categoryRoutes from './modules/categories/categories.routes';
import brandRoutes from './modules/brands/brands.routes';
import agentRoutes from './modules/agents/agents.routes';
import customerRoutes from './modules/customers/customers.routes';
import supplierRoutes from './modules/suppliers/suppliers.routes';
import productRoutes from './modules/products/products.routes';
import invoiceRoutes from './modules/invoices/invoices.routes';
import purchaseOrderRoutes from './modules/purchase-orders/purchase-orders.routes';
import deliveryReceiptRoutes from './modules/delivery-receipts/delivery-receipts.routes';
import quotationRoutes from './modules/quotations/quotations.routes';
import collectionRoutes from './modules/collections/collections.routes';
import checkVoucherRoutes from './modules/check-vouchers/check-vouchers.routes';
import reportRoutes from './modules/reports/reports.routes';
import adminRoutes from './modules/admin/admin.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import { requireAuth } from './middleware/auth';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Public auth endpoints (each enforces its own guards).
router.use('/auth', authRoutes);

// Everything below requires a valid session.
router.use(requireAuth);
router.use('/categories', categoryRoutes);
router.use('/brands', brandRoutes);
router.use('/agents', agentRoutes);
router.use('/customers', customerRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/products', productRoutes);
router.use('/invoices', invoiceRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/delivery-receipts', deliveryReceiptRoutes);
router.use('/quotations', quotationRoutes);
router.use('/collections', collectionRoutes);
router.use('/check-vouchers', checkVoucherRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);
router.use('/dashboard', dashboardRoutes);

export default router;
