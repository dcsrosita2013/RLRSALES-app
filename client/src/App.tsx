import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from './routes/ProtectedRoute';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { Login } from './pages/Login';
import { ChangePassword } from './pages/ChangePassword';
import { Dashboard } from './pages/Dashboard';
import { ProductsPage } from './pages/products/ProductsPage';
import { CustomersPage } from './pages/CustomersPage';
import { AgentsPage } from './pages/AgentsPage';
import { SuppliersPage } from './pages/SuppliersPage';
import { InvoicesPage } from './pages/invoices/InvoicesPage';
import { InvoiceFormPage } from './pages/invoices/InvoiceFormPage';
import { InvoiceDetailPage } from './pages/invoices/InvoiceDetailPage';
import { POsPage } from './pages/purchase-orders/POsPage';
import { POFormPage } from './pages/purchase-orders/POFormPage';
import { PODetailPage } from './pages/purchase-orders/PODetailPage';
import { DRsPage } from './pages/delivery-receipts/DRsPage';
import { DRFormPage } from './pages/delivery-receipts/DRFormPage';
import { DRDetailPage } from './pages/delivery-receipts/DRDetailPage';
import { QuotationsPage } from './pages/quotations/QuotationsPage';
import { QuotationFormPage } from './pages/quotations/QuotationFormPage';
import { QuotationDetailPage } from './pages/quotations/QuotationDetailPage';
import { CollectionsPage } from './pages/CollectionsPage';
import { CheckVouchersPage } from './pages/CheckVouchersPage';
import { ReportsPage } from './pages/ReportsPage';
import { SettingsPage } from './pages/SettingsPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/change-password"
        element={
          <ProtectedRoute>
            <ChangePassword />
          </ProtectedRoute>
        }
      />

      {/* Authenticated app shell */}
      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />

        <Route
          path="/quotations"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']}>
              <QuotationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations/new"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']}>
              <QuotationFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations/:id"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']}>
              <QuotationDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/quotations/:id/edit"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']}>
              <QuotationFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT', 'FINANCE']}>
              <InvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/new"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']}>
              <InvoiceFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/:id"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT', 'FINANCE']}>
              <InvoiceDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices/:id/edit"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT']}>
              <InvoiceFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delivery-receipts"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT', 'WAREHOUSE']}>
              <DRsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delivery-receipts/new"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT', 'WAREHOUSE']}>
              <DRFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delivery-receipts/:id"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT', 'WAREHOUSE']}>
              <DRDetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delivery-receipts/:id/edit"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT', 'WAREHOUSE']}>
              <DRFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/products"
          element={
            <ProtectedRoute roles={['ADMIN', 'WAREHOUSE', 'AGENT']}>
              <ProductsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-orders"
          element={
            <ProtectedRoute roles={['ADMIN', 'WAREHOUSE', 'FINANCE']}>
              <POsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-orders/new"
          element={
            <ProtectedRoute roles={['ADMIN', 'WAREHOUSE']}>
              <POFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-orders/:id"
          element={
            <ProtectedRoute roles={['ADMIN', 'WAREHOUSE', 'FINANCE']}>
              <PODetailPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/purchase-orders/:id/edit"
          element={
            <ProtectedRoute roles={['ADMIN', 'WAREHOUSE']}>
              <POFormPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute roles={['ADMIN', 'AGENT', 'FINANCE']}>
              <CustomersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute roles={['ADMIN', 'WAREHOUSE', 'FINANCE']}>
              <SuppliersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/agents"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AgentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/collections"
          element={
            <ProtectedRoute roles={['ADMIN', 'FINANCE']}>
              <CollectionsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/check-vouchers"
          element={
            <ProtectedRoute roles={['ADMIN', 'FINANCE']}>
              <CheckVouchersPage />
            </ProtectedRoute>
          }
        />
        <Route path="/reports" element={<ReportsPage />} />
        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <SettingsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
