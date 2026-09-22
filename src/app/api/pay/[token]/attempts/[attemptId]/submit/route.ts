import { paymentService } from "@/server/payments/service";
import { paymentBody, paymentResponse } from "@/server/payments/http";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ token: string; attemptId: string }> }) {
  return paymentResponse(async () => {
    const { token, attemptId } = await context.params;
    const body = await paymentBody(request, ["signedXdr"]);
    return paymentService().submit(token, attemptId, body.signedXdr);
  });
}
