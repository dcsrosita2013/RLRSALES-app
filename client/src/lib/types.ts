export type Role = 'ADMIN' | 'AGENT' | 'WAREHOUSE' | 'FINANCE';

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  mustChangePassword: boolean;
  agentId: string | null;
  isActive: boolean;
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin / Owner',
  AGENT: 'Sales Agent',
  WAREHOUSE: 'Warehouse',
  FINANCE: 'Finance / Collections',
};

// ----- Master data enums + labels -----
export type VatClass = 'VAT' | 'VAT_ADD' | 'ZERO_RATED' | 'VAT_EXEMPT';
export type Floor = 'FIRST' | 'SECOND';
export type TermsType = 'COD' | 'NET';

export const VAT_LABELS: Record<VatClass, string> = {
  VAT: 'VAT (12%)',
  VAT_ADD: 'Add VAT (12% on top)',
  ZERO_RATED: 'Zero-Rated',
  VAT_EXEMPT: 'VAT-Exempt',
};

export const FLOOR_LABELS: Record<Floor, string> = {
  FIRST: 'First Floor',
  SECOND: 'Second Floor',
};

export const COMMON_UNITS = ['pc', 'set', 'box', 'meter', 'kg', 'can', 'roll', 'pack', 'pair'];

// ----- Entities -----
export interface Category {
  id: string;
  name: string;
  productCount?: number;
}

export interface Brand {
  id: string;
  name: string;
  productCount?: number;
}

export interface Agent {
  id: string;
  name: string;
  address: string | null;
  contactNumber: string | null;
  customerCount?: number;
}

export interface Customer {
  id: string;
  name: string;
  address: string | null;
  tin: string | null;
  contactNumber: string | null;
  vatClass: VatClass;
  termsType: TermsType;
  netDays: number | null;
  commissionable: boolean;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  createdAt?: string;
}

export interface Supplier {
  id: string;
  name: string;
  address: string | null;
  tin: string | null;
  contactNumber: string | null;
  termsType: TermsType;
  netDays: number | null;
}

export interface StockLocation {
  id: string;
  floor: Floor;
  roomNumber: string;
  quantity: number;
}

export interface PriceOption {
  markup: number;
  price: number;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  unit: string;
  origin: string | null;
  categoryId: string | null;
  brandId: string | null;
  category: { id: string; name: string } | null;
  brand: { id: string; name: string } | null;
  costPrice: number;
  basePrice: number;
  priceOptions: PriceOption[];
  isActive: boolean;
  stocks: StockLocation[];
  totalQuantity: number;
  lastReceivedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// ----- Sales Invoice -----
export type InvoiceStatus = 'DRAFT' | 'FINALIZED' | 'VOID';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface InvoiceItem {
  id?: string;
  productId: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPrice: number;
  lineTotal?: number;
}

export interface Invoice {
  id: string;
  number: string | null;
  date: string;
  customerId: string;
  customerName: string;
  customerTin: string | null;
  vatClass: VatClass;
  termsType: TermsType;
  netDays: number | null;
  poNumber: string | null;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  addVat: boolean;
  subtotal: number;
  discount: number;
  vatableSales: number;
  zeroRatedSales: number;
  vatExemptSales: number;
  vatAmount: number;
  total: number;
  totalCost: number;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  createdBy: { id: string; fullName: string } | null;
  finalizedAt: string | null;
  voidedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  items: InvoiceItem[];
}

export interface InvoiceSummary {
  id: string;
  number: string | null;
  date: string;
  customerId: string;
  customerName: string;
  vatClass: VatClass;
  total: number;
  amountPaid: number;
  status: InvoiceStatus;
  paymentStatus: PaymentStatus;
  agentName: string | null;
}

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  FINALIZED: 'Finalized',
  VOID: 'Void',
};

export const PAYMENT_LABEL: Record<PaymentStatus, string> = {
  UNPAID: 'Unpaid',
  PARTIAL: 'Partial',
  PAID: 'Paid',
};

// ----- Purchase Order -----
export type POApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface POItem {
  id?: string;
  productId: string | null;
  description: string;
  qty: number;
  unit: string;
  unitCost: number;
  lineTotal?: number;
  floor: Floor | null;
  roomNumber: string | null;
}

export interface PurchaseOrder {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  supplier: { id: string; name: string } | null;
  invoiceDate: string;
  termsType: TermsType;
  netDays: number | null;
  notes: string | null;
  subtotal: number;
  total: number;
  approvalStatus: POApprovalStatus;
  approvedBy: { id: string; fullName: string } | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  paidAt: string | null;
  received: boolean;
  receivedAt: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  items: POItem[];
}

export interface POSummary {
  id: string;
  number: string;
  invoiceDate: string;
  supplierName: string;
  total: number;
  approvalStatus: POApprovalStatus;
  paymentStatus: PaymentStatus;
  received: boolean;
}

export const PO_APPROVAL_LABEL: Record<POApprovalStatus, string> = {
  PENDING: 'Pending approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

// ----- Delivery Receipt -----
export interface DRItem {
  id?: string;
  productId: string | null;
  description: string;
  qty: number;
  unit: string;
}

export interface DeliveryReceipt {
  id: string;
  number: string;
  date: string;
  poNumber: string | null;
  customerId: string;
  customerName: string;
  customer: { id: string; name: string } | null;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  termsType: TermsType;
  netDays: number | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  notes: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  items: DRItem[];
}

export interface DRSummary {
  id: string;
  number: string;
  date: string;
  customerName: string;
  poNumber: string | null;
  invoiceNumber: string | null;
  itemCount: number;
}

// ----- Quotation -----
export interface QuotationItem {
  id?: string;
  productId: string | null;
  description: string;
  qty: number;
  unit: string;
  markupOption: string | null;
  unitPrice: number;
  lineTotal?: number;
}

export interface Quotation {
  id: string;
  number: string;
  date: string;
  customerId: string;
  customerName: string;
  attention: string | null;
  department: string | null;
  prNumber: string | null;
  customer: { id: string; name: string } | null;
  agentId: string | null;
  agent: { id: string; name: string } | null;
  validUntil: string | null;
  notes: string | null;
  subtotal: number;
  total: number;
  convertedInvoiceId: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
  items: QuotationItem[];
}

export interface QuotationSummary {
  id: string;
  number: string;
  date: string;
  customerName: string;
  total: number;
  validUntil: string | null;
  converted: boolean;
}

// ----- Collections / Check Vouchers -----
export type PaymentMethod = 'CASH' | 'CHECK' | 'BANK_TRANSFER';
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  CHECK: 'Check',
  BANK_TRANSFER: 'Bank Transfer',
};

export interface CollectionSummary {
  id: string;
  number: string;
  date: string;
  customerName: string;
  invoiceNumber: string | null;
  amount: number;
  method: PaymentMethod;
}

export interface CVSummary {
  id: string;
  number: string;
  date: string;
  payee: string;
  checkNumber: string | null;
  amount: number;
}

export interface CheckVoucher {
  id: string;
  number: string;
  date: string;
  payee: string;
  bank: string | null;
  checkNumber: string | null;
  checkDate: string | null;
  termsType: TermsType | null;
  amount: number;
  purpose: string | null;
  supplierId: string | null;
  supplier: { id: string; name: string } | null;
  poId: string | null;
  poNumber: string | null;
  createdBy: { id: string; fullName: string } | null;
  createdAt: string;
}

// ----- Reports -----
export interface ReportColumn {
  key: string;
  label: string;
  money?: boolean;
  align?: 'left' | 'right';
}
export interface ReportResult {
  title: string;
  columns: ReportColumn[];
  rows: Record<string, string | number | null>[];
  totals?: Record<string, number>;
}
export interface ReportMeta {
  key: string;
  label: string;
  filters: string[];
}

// ----- Admin / Settings -----
export interface DocSequence {
  docType: string;
  prefix: string;
  nextNumber: number;
  padding: number;
}
export interface BackupRow {
  id: string;
  filename: string;
  sizeBytes: number | null;
  createdAt: string;
  createdBy: string | null;
}
export interface AuditEntry {
  id: string;
  createdAt: string;
  username: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  details: unknown;
}
export interface AdminUser {
  id: string;
  username: string;
  fullName: string;
  role: Role;
  isActive: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  agentId: string | null;
}

export interface ImportResult {
  created: number;
  updated: number;
  errors: { row: number; message: string }[];
}
