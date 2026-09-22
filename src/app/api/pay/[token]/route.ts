import { paymentService } from "@/server/payments/service";
import { paymentResponse } from "@/server/payments/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  return paymentResponse(async () => paymentService().invoiceStatus((await context.params).token));
}
