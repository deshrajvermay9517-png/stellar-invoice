"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth/session";
import { invoiceService } from "./service";
import { ValidationError } from "@/lib/invoice-validation";
import type { FormState } from "@/lib/form-state";

export async function saveReceivingAccount(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  try {
    await invoiceService().saveReceivingAccount(form.get("receivingAccount"));
  } catch (error) {
    if (error instanceof ValidationError) return { message: error.message, errors: error.fields };
    return { message: "We couldn’t save your account. Please try again." };
  }
  revalidatePath("/settings");
  revalidatePath("/invoices/new");
  return { success: true, message: "Receiving account saved. Existing invoice destinations remain unchanged." };
}

export async function createInvoice(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  let id: string;
  try {
    id = await invoiceService().createInvoice({
      customerName: form.get("customerName"), customerEmail: form.get("customerEmail"),
      description: form.get("description"), amount: form.get("amount"), dueDate: form.get("dueDate"),
    });
  } catch (error) {
    if (error instanceof ValidationError) return { message: error.message, errors: error.fields };
    return { message: "We couldn’t create the invoice. Check your invoice list before trying again." };
  }
  revalidatePath("/invoices");
  redirect(`/invoices/${id}`);
}
