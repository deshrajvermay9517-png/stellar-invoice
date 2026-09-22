import { parseXlm } from "./amount.ts";

export type InvoiceInput = {
  customerName: unknown;
  customerEmail: unknown;
  description: unknown;
  amount: unknown;
  dueDate: unknown;
};

export class ValidationError extends Error {
  fields: Record<string, string>;
  constructor(fields: Record<string, string>) {
    super("Please check the highlighted fields.");
    this.fields = fields;
  }
}

export function validateInvoice(input: InvoiceInput) {
  const errors: Record<string, string> = {};
  function text(value: unknown, field: string, max: number): string {
    if (typeof value !== "string" || !value.trim() || value.trim().length > max || /[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(value)) {
      errors[field] = `Enter between 1 and ${max} characters.`;
      return "";
    }
    return value.trim();
  }
  const customerName = text(input.customerName, "customerName", 120);
  const customerEmail = text(input.customerEmail, "customerEmail", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) errors.customerEmail = "Enter a valid customer email address.";
  const description = text(input.description, "description", 2000);
  let amountStroops = 0;
  try { amountStroops = parseXlm(input.amount); }
  catch (error) { errors.amount = (error as Error).message; }
  const dueDate = typeof input.dueDate === "string" ? input.dueDate : "";
  const parsedDate = new Date(`${dueDate}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || dueDate < "1900-01-01" ||
      !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== dueDate) {
    errors.dueDate = "Enter a valid calendar date (year 1900 or later).";
  }
  if (Object.keys(errors).length) throw new ValidationError(errors);
  return { customerName, customerEmail, description, amountStroops, dueDate };
}
