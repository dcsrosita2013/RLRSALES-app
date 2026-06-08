import { api } from './api';
import type {
  Product,
  Category,
  Brand,
  Customer,
  Agent,
  Supplier,
  Floor,
  Invoice,
  InvoiceSummary,
  TermsType,
  PurchaseOrder,
  POSummary,
  DeliveryReceipt,
  DRSummary,
  Quotation,
  QuotationSummary,
  CollectionSummary,
  CheckVoucher,
  CVSummary,
  PaymentMethod,
  ReportMeta,
  ReportResult,
  DocSequence,
  BackupRow,
  AuditEntry,
  AdminUser,
  Role,
  ImportResult,
} from './types';

// ----- Categories -----
export const CategoriesApi = {
  list: () => api.get<Category[]>('/categories').then((r) => r.data),
  create: (name: string) => api.post<Category>('/categories', { name }).then((r) => r.data),
  update: (id: string, name: string) => api.put<Category>(`/categories/${id}`, { name }).then((r) => r.data),
  remove: (id: string) => api.delete(`/categories/${id}`).then((r) => r.data),
};

// ----- Brands -----
export const BrandsApi = {
  list: () => api.get<Brand[]>('/brands').then((r) => r.data),
  create: (name: string) => api.post<Brand>('/brands', { name }).then((r) => r.data),
  update: (id: string, name: string) => api.put<Brand>(`/brands/${id}`, { name }).then((r) => r.data),
  remove: (id: string) => api.delete(`/brands/${id}`).then((r) => r.data),
};

// ----- Agents -----
export interface AgentInput {
  name: string;
  address?: string | null;
  contactNumber?: string | null;
}
export const AgentsApi = {
  list: () => api.get<Agent[]>('/agents').then((r) => r.data),
  create: (data: AgentInput) => api.post<Agent>('/agents', data).then((r) => r.data),
  update: (id: string, data: AgentInput) => api.put<Agent>(`/agents/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/agents/${id}`).then((r) => r.data),
};

// ----- Customers -----
export interface CustomerInput {
  name: string;
  address?: string | null;
  tin?: string | null;
  contactNumber?: string | null;
  vatClass: Customer['vatClass'];
  termsType?: Customer['termsType'];
  netDays?: number | null;
  commissionable?: boolean;
  agentId?: string | null;
}
export const CustomersApi = {
  list: (params?: { q?: string; agentId?: string }) =>
    api.get<Customer[]>('/customers', { params }).then((r) => r.data),
  create: (data: CustomerInput) => api.post<Customer>('/customers', data).then((r) => r.data),
  update: (id: string, data: CustomerInput) => api.put<Customer>(`/customers/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/customers/${id}`).then((r) => r.data),
};

// ----- Suppliers -----
export interface SupplierInput {
  name: string;
  address?: string | null;
  tin?: string | null;
  contactNumber?: string | null;
  termsType: Supplier['termsType'];
  netDays?: number | null;
}
export const SuppliersApi = {
  list: (params?: { q?: string }) => api.get<Supplier[]>('/suppliers', { params }).then((r) => r.data),
  create: (data: SupplierInput) => api.post<Supplier>('/suppliers', data).then((r) => r.data),
  update: (id: string, data: SupplierInput) => api.put<Supplier>(`/suppliers/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/suppliers/${id}`).then((r) => r.data),
};

// ----- Products -----
export interface ProductInput {
  name: string;
  description?: string | null;
  categoryId?: string | null;
  brandId?: string | null;
  unit: string;
  origin?: string | null;
  costPrice?: number;
  basePrice?: number;
  stocks?: { floor: Floor; roomNumber: string; quantity: number }[];
}
export const ProductsApi = {
  list: (params?: { q?: string; categoryId?: string; brandId?: string; limit?: number }) =>
    api.get<Product[]>('/products', { params }).then((r) => r.data),
  get: (id: string) => api.get<Product>(`/products/${id}`).then((r) => r.data),
  create: (data: ProductInput) => api.post<Product>('/products', data).then((r) => r.data),
  update: (id: string, data: ProductInput) => api.put<Product>(`/products/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/products/${id}`).then((r) => r.data),
  import: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return api.post<ImportResult>('/products/import', fd).then((r) => r.data);
  },
  addStock: (id: string, data: { floor: Floor; roomNumber: string; quantity: number }) =>
    api.post<Product>(`/products/${id}/stock`, data).then((r) => r.data),
  adjustStock: (id: string, stockId: string, data: { delta: number; note?: string | null }) =>
    api.post<Product>(`/products/${id}/stock/${stockId}/adjust`, data).then((r) => r.data),
  removeStock: (id: string, stockId: string) =>
    api.delete<Product>(`/products/${id}/stock/${stockId}`).then((r) => r.data),
};

// ----- Sales Invoices -----
export interface InvoiceItemInput {
  productId?: string | null;
  description?: string;
  qty: number;
  unit: string;
  unitPrice: number;
}
export interface InvoiceInput {
  customerId: string;
  number?: string | null;
  date?: string;
  termsType: TermsType;
  netDays?: number | null;
  poNumber?: string | null;
  agentId?: string | null;
  addVat: boolean;
  discount: number;
  items: InvoiceItemInput[];
}
export const InvoicesApi = {
  list: (params?: { q?: string; status?: string; paymentStatus?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<InvoiceSummary[]>('/invoices', { params }).then((r) => r.data),
  get: (id: string) => api.get<Invoice>(`/invoices/${id}`).then((r) => r.data),
  create: (data: InvoiceInput) => api.post<Invoice>('/invoices', data).then((r) => r.data),
  update: (id: string, data: InvoiceInput) => api.put<Invoice>(`/invoices/${id}`, data).then((r) => r.data),
  finalize: (id: string) => api.post<Invoice>(`/invoices/${id}/finalize`).then((r) => r.data),
  void: (id: string) => api.post<Invoice>(`/invoices/${id}/void`).then((r) => r.data),
  setPaid: (id: string, paid: boolean) => api.post<Invoice>(`/invoices/${id}/payment`, { paid }).then((r) => r.data),
  remove: (id: string) => api.delete(`/invoices/${id}`).then((r) => r.data),
  forceDelete: (id: string, password: string) => api.post(`/invoices/${id}/force-delete`, { password }).then((r) => r.data),
  pdf: (id: string) => api.get(`/invoices/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data as Blob),
};

// ----- Purchase Orders -----
export interface POItemInput {
  productId?: string | null;
  description?: string;
  qty: number;
  unit: string;
  unitCost: number;
  floor?: Floor | null;
  roomNumber?: string | null;
}
export interface POInput {
  supplierId: string;
  invoiceDate?: string;
  termsType: TermsType;
  netDays?: number | null;
  notes?: string | null;
  items: POItemInput[];
}
export const PurchaseOrdersApi = {
  list: (params?: { q?: string; approvalStatus?: string; paymentStatus?: string; received?: string }) =>
    api.get<POSummary[]>('/purchase-orders', { params }).then((r) => r.data),
  get: (id: string) => api.get<PurchaseOrder>(`/purchase-orders/${id}`).then((r) => r.data),
  create: (data: POInput) => api.post<PurchaseOrder>('/purchase-orders', data).then((r) => r.data),
  update: (id: string, data: POInput) => api.put<PurchaseOrder>(`/purchase-orders/${id}`, data).then((r) => r.data),
  approve: (id: string) => api.post<PurchaseOrder>(`/purchase-orders/${id}/approve`).then((r) => r.data),
  reject: (id: string, reason: string | null) =>
    api.post<PurchaseOrder>(`/purchase-orders/${id}/reject`, { reason }).then((r) => r.data),
  receive: (id: string) => api.post<PurchaseOrder>(`/purchase-orders/${id}/receive`).then((r) => r.data),
  setPaid: (id: string, paid: boolean) => api.post<PurchaseOrder>(`/purchase-orders/${id}/payment`, { paid }).then((r) => r.data),
  remove: (id: string) => api.delete(`/purchase-orders/${id}`).then((r) => r.data),
  forceDelete: (id: string, password: string) => api.post(`/purchase-orders/${id}/force-delete`, { password }).then((r) => r.data),
  pdf: (id: string) => api.get(`/purchase-orders/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data as Blob),
};

// ----- Delivery Receipts -----
export interface DRItemInput {
  productId?: string | null;
  description?: string;
  qty: number;
  unit: string;
}
export interface DRInput {
  number?: string | null;
  date?: string;
  poNumber?: string | null;
  customerId: string;
  agentId?: string | null;
  termsType: TermsType;
  netDays?: number | null;
  invoiceId?: string | null;
  notes?: string | null;
  items: DRItemInput[];
}
export const DeliveryReceiptsApi = {
  list: (params?: { q?: string; customerId?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<DRSummary[]>('/delivery-receipts', { params }).then((r) => r.data),
  get: (id: string) => api.get<DeliveryReceipt>(`/delivery-receipts/${id}`).then((r) => r.data),
  create: (data: DRInput) => api.post<DeliveryReceipt>('/delivery-receipts', data).then((r) => r.data),
  update: (id: string, data: DRInput) => api.put<DeliveryReceipt>(`/delivery-receipts/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/delivery-receipts/${id}`).then((r) => r.data),
  pdf: (id: string) => api.get(`/delivery-receipts/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data as Blob),
};

// ----- Quotations -----
export interface QuotationItemInput {
  productId?: string | null;
  description?: string;
  qty: number;
  unit: string;
  markupOption?: string | null;
  unitPrice: number;
}
export interface QuotationInput {
  number?: string | null;
  date?: string;
  customerId: string;
  attention?: string | null;
  department?: string | null;
  prNumber?: string | null;
  agentId?: string | null;
  validUntil?: string | null;
  notes?: string | null;
  items: QuotationItemInput[];
}
export const QuotationsApi = {
  list: (params?: { q?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<QuotationSummary[]>('/quotations', { params }).then((r) => r.data),
  get: (id: string) => api.get<Quotation>(`/quotations/${id}`).then((r) => r.data),
  create: (data: QuotationInput) => api.post<Quotation>('/quotations', data).then((r) => r.data),
  update: (id: string, data: QuotationInput) => api.put<Quotation>(`/quotations/${id}`, data).then((r) => r.data),
  convert: (id: string) => api.post<Invoice>(`/quotations/${id}/convert`).then((r) => r.data),
  remove: (id: string) => api.delete(`/quotations/${id}`).then((r) => r.data),
  pdf: (id: string) => api.get(`/quotations/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data as Blob),
};

// ----- Collections -----
export interface CollectionInput {
  number?: string | null;
  date?: string;
  customerId: string;
  invoiceId?: string | null;
  amount: number;
  method: PaymentMethod;
  checkNumber?: string | null;
  checkBank?: string | null;
  checkDate?: string | null;
  bankRef?: string | null;
  notes?: string | null;
}
export const CollectionsApi = {
  list: (params?: { q?: string; customerId?: string; invoiceId?: string; method?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<CollectionSummary[]>('/collections', { params }).then((r) => r.data),
  create: (data: CollectionInput) => api.post('/collections', data).then((r) => r.data),
  remove: (id: string) => api.delete(`/collections/${id}`).then((r) => r.data),
};

// ----- Check Vouchers -----
export interface CVInput {
  number?: string | null;
  date?: string;
  payee: string;
  bank?: string | null;
  checkNumber?: string | null;
  checkDate?: string | null;
  amount: number;
  purpose?: string | null;
  supplierId?: string | null;
  poId?: string | null;
}
export const CheckVouchersApi = {
  list: (params?: { q?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<CVSummary[]>('/check-vouchers', { params }).then((r) => r.data),
  get: (id: string) => api.get<CheckVoucher>(`/check-vouchers/${id}`).then((r) => r.data),
  create: (data: CVInput) => api.post<CheckVoucher>('/check-vouchers', data).then((r) => r.data),
  remove: (id: string) => api.delete(`/check-vouchers/${id}`).then((r) => r.data),
  pdf: (id: string) => api.get(`/check-vouchers/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data as Blob),
};

// ----- Reports -----
export type ReportParams = Record<string, string | undefined>;
export const ReportsApi = {
  list: () => api.get<ReportMeta[]>('/reports').then((r) => r.data),
  run: (key: string, params: ReportParams) => api.get<ReportResult>(`/reports/${key}`, { params }).then((r) => r.data),
  excel: (key: string, params: ReportParams) =>
    api.get(`/reports/${key}`, { params: { ...params, format: 'excel' }, responseType: 'blob' }).then((r) => r.data as Blob),
};

// ----- Admin / Settings -----
export interface CreateUserInput {
  username: string;
  fullName: string;
  role: Role;
  agentId?: string | null;
  password?: string;
}
export interface UpdateUserInput {
  fullName: string;
  role: Role;
  isActive: boolean;
  agentId?: string | null;
}
export interface SalesMonitor {
  todayTotal: number;
  todayCount: number;
  monthTotal: number;
  monthCount: number;
  byDay: { date: string; total: number }[];
  byMonth: { month: string; label: string; total: number }[];
}
export const DashboardApi = {
  salesMonitor: () => api.get<SalesMonitor>('/dashboard/sales-monitor').then((r) => r.data),
};

export const AdminApi = {
  backupNow: () => api.post<{ filename: string; sizeBytes: number }>('/admin/backup').then((r) => r.data),
  backups: () => api.get<BackupRow[]>('/admin/backups').then((r) => r.data),
  audit: (params?: { entityType?: string; action?: string; dateFrom?: string; dateTo?: string }) =>
    api.get<AuditEntry[]>('/admin/audit', { params }).then((r) => r.data),
  sequences: () => api.get<DocSequence[]>('/admin/sequences').then((r) => r.data),
  updateSequence: (docType: string, data: { prefix: string; nextNumber: number; padding: number }) =>
    api.put<DocSequence>(`/admin/sequences/${docType}`, data).then((r) => r.data),
  users: () => api.get<AdminUser[]>('/admin/users').then((r) => r.data),
  createUser: (data: CreateUserInput) => api.post<{ id: string; username: string; tempPassword: string }>('/admin/users', data).then((r) => r.data),
  updateUser: (id: string, data: UpdateUserInput) => api.put<AdminUser>(`/admin/users/${id}`, data).then((r) => r.data),
  resetPassword: (id: string, password?: string) =>
    api.post<{ tempPassword: string | null }>(`/admin/users/${id}/reset-password`, password ? { password } : {}).then((r) => r.data),
  deleteUser: (id: string) => api.delete(`/admin/users/${id}`).then((r) => r.data),
};

