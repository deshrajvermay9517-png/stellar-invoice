import "server-only";
import { requireUser } from "@/server/auth/session";
import { getDatabase } from "@/server/db/client";
import { createInvoiceStore } from "./store";

export function invoiceService() {
  return createInvoiceStore(getDatabase(), requireUser);
}
