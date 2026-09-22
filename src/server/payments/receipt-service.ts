import "server-only";
import { requireUser } from "../auth/session";
import { getDatabase } from "../db/client";
import { createReceiptStore } from "./receipts";

export function receiptService() {
  return createReceiptStore(getDatabase(), requireUser);
}
