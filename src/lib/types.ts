export type ApiEnvelope<T> = {
  message: T;
};

export type ApiErrorBody = {
  error: true;
  title: string;
  message: string;
};

export type MeResponse = {
  user: string;
  full_name: string;
  employee: string;
  employee_name: string;
  sales_person: string;
  sales_person_name: string;
  has_sales_app_access: boolean;
};

export type DashboardSummary = {
  period_days: number;
  draft_count: number;
  submitted_count: number;
  quotation_value: number;
};

export type QuotationListItem = {
  name: string;
  customer: string;
  customer_name: string;
  transaction_date: string;
  creation?: string;
  docstatus: 0 | 1 | 2;
  status: "Draft" | "Submitted" | "Cancelled";
  grand_total: number;
  item_count: number;
};

export type QuotationDetail = QuotationListItem & {
  items: Array<{
    item_code: string;
    item_name: string;
    qty: number;
    uom: string;
    rate: number;
    discount_percentage: number;
    amount: number;
  }>;
  taxes: Array<{
    description: string;
    charge_type: string;
    rate: number;
    tax_amount: number;
    total: number;
  }>;
  net_total: number;
};

export type CustomerSearchResult = {
  name: string;
  customer_name: string;
  territory?: string;
  mobile_no?: string;
};

export type ItemSearchResult = {
  item_code: string;
  item_name: string;
  stock_uom: string;
  item_group: string;
};

export type QuotationInputItem = {
  item_code: string;
  qty: number;
};
