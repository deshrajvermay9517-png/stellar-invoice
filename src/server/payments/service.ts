import "server-only";
import { getDatabase } from "../db/client";
import { createPaymentRpc } from "./rpc";
import { createPaymentStore } from "./store";

export function paymentService() {
  return createPaymentStore(getDatabase(), createPaymentRpc());
}
