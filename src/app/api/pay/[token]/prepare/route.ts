import { paymentService } from "@/server/payments/service";
import { paymentBody, paymentResponse } from "@/server/payments/http";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ token: string }> }) {
  return paymentResponse(async () => {
    const { token } = await context.params;
    const body = await paymentBody(request, ["sourceAccount"]);
    return paymentService().prepare(token, body.sourceAccount);
  });
}
