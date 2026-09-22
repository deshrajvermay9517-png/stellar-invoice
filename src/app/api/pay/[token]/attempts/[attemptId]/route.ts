import { paymentService } from "@/server/payments/service";
import { paymentResponse } from "@/server/payments/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ token: string; attemptId: string }> }) {
  return paymentResponse(async () => {
    const { token, attemptId } = await context.params;
    return paymentService().status(token, attemptId);
  });
}
