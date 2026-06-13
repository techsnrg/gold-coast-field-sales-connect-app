import Constants from "expo-constants";

import {
  ApiEnvelope,
  ApiErrorBody,
  CustomerSearchResult,
  DashboardSummary,
  ItemSearchResult,
  MeResponse,
  QuotationDetail,
  QuotationInputItem,
  QuotationListItem
} from "./types";

export const DEFAULT_BASE_URL =
  (Constants.expoConfig?.extra?.erpnextBaseUrl as string | undefined) ||
  "https://snrgv15backedup.m.frappe.cloud";

export class ApiError extends Error {
  title: string;

  constructor(title: string, message: string) {
    super(message);
    this.title = title;
  }
}

export class ApiClient {
  private baseUrl: string;
  private cookie?: string;

  constructor(baseUrl: string, cookie?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.cookie = cookie;
  }

  async login(username: string, password: string) {
    const body = new URLSearchParams();
    body.append("usr", username);
    body.append("pwd", password);

    const response = await fetch(`${this.baseUrl}/api/method/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString(),
      credentials: "include"
    });

    const json = await response.json();
    if (!response.ok || json.exc_type || json.exception) {
      throw new ApiError("Could not login", json.message || "Invalid ERPNext credentials.");
    }

    const setCookie = response.headers.get("set-cookie") || "";
    const cookie = normalizeCookie(setCookie);
    if (!cookie) {
      throw new ApiError("Could not login", "ERPNext did not return a session cookie.");
    }

    return cookie;
  }

  async me() {
    return this.get<MeResponse>("me");
  }

  async dashboardSummary() {
    return this.get<DashboardSummary>("dashboard_summary");
  }

  async myQuotations(status: "All" | "Draft" | "Submitted", query: string) {
    return this.get<{ quotations: QuotationListItem[] }>("my_quotations", { status, query }).then(
      (response) => response.quotations
    );
  }

  async quotationDetail(quotation: string) {
    return this.get<QuotationDetail>("quotation_detail", { quotation });
  }

  async searchCustomers(query: string) {
    return this.get<{ customers: CustomerSearchResult[] }>("search_customers", { query }).then(
      (response) => response.customers
    );
  }

  async searchItems(query: string) {
    return this.get<{ items: ItemSearchResult[] }>("search_items", { query }).then(
      (response) => response.items
    );
  }

  async previewQuotation(customer: string, items: QuotationInputItem[]) {
    return this.post<QuotationDetail>("preview_quotation", { customer, items: JSON.stringify(items) });
  }

  async saveQuotationDraft(customer: string, items: QuotationInputItem[]) {
    return this.post<QuotationDetail & { message: string }>("save_quotation_draft", {
      customer,
      items: JSON.stringify(items)
    });
  }

  private async get<T>(method: string, params: Record<string, string> = {}) {
    const url = new URL(`${this.baseUrl}/api/method/gold_coast_field_connect.gold_coast_field_connect.api.${method}`);
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    return this.request<T>(url.toString());
  }

  private async post<T>(method: string, params: Record<string, string>) {
    const body = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => body.append(key, value));

    return this.request<T>(`${this.baseUrl}/api/method/gold_coast_field_connect.gold_coast_field_connect.api.${method}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: body.toString()
    });
  }

  private async request<T>(url: string, init: RequestInit = {}) {
    const response = await fetch(url, {
      ...init,
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(init.headers || {})
      }
    });

    const json = await parseResponse(response);
    if (!response.ok) {
      throw new ApiError("ERPNext request failed", readFrappeError(json));
    }

    if ("message" in json && isApiErrorBody(json.message)) {
      throw new ApiError(json.message.title, json.message.message);
    }

    if ("message" in json) {
      return json.message as T;
    }

    throw new ApiError("ERPNext request failed", "Unexpected API response.");
  }
}

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ApiEnvelope<unknown> | { exception?: string; message?: unknown; _server_messages?: string };
  } catch {
    return { message: text };
  }
}

function readFrappeError(json: { exception?: string; message?: unknown; _server_messages?: string }) {
  const serverMessage = parseServerMessages(json._server_messages);
  if (serverMessage) {
    return serverMessage;
  }

  if (typeof json.message === "string") {
    return json.message;
  }

  if (isApiErrorBody(json.message)) {
    return json.message.message;
  }

  if (json.message && typeof json.message === "object") {
    return JSON.stringify(json.message);
  }

  return json.exception || "Please try again.";
}

function parseServerMessages(value?: string) {
  if (!value) {
    return "";
  }

  try {
    const messages = JSON.parse(value) as string[];
    return messages
      .map((message) => {
        try {
          const parsed = JSON.parse(message) as { message?: string; title?: string };
          return parsed.message || parsed.title || "";
        } catch {
          return message;
        }
      })
      .filter(Boolean)
      .join("\n")
      .replace(/<[^<]+?>/g, "");
  } catch {
    return value.replace(/<[^<]+?>/g, "");
  }
}

function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return Boolean(value && typeof value === "object" && "error" in value && "title" in value && "message" in value);
}

function normalizeCookie(setCookie: string) {
  if (!setCookie) {
    return "";
  }

  return setCookie
    .split(/,(?=\s*[A-Za-z_]+=)/)
    .map((part) => part.split(";")[0].trim())
    .filter((part) => part.startsWith("sid=") || part.startsWith("system_user=") || part.startsWith("user_id=") || part.startsWith("full_name="))
    .join("; ");
}
