"use client";

import { useActionState, useState } from "react";
import { saveReceivingAccount } from "@/server/invoices/actions";

export function ReceivingAccountForm({ initialAccount }: { initialAccount: string | null }) {
  const [state, action, pending] = useActionState(saveReceivingAccount, {});
  const [value, setValue] = useState(initialAccount ?? "");
  return (
    <form action={action} className="merchant-form">
      {state.message && <div className="auth-notice" role={state.success ? "status" : "alert"}>{state.message}</div>}
      <div className="form-field">
        <label htmlFor="receivingAccount">Stellar Testnet receiving account</label>
        <input id="receivingAccount" name="receivingAccount" required maxLength={56} autoComplete="off" autoCapitalize="off" spellCheck={false}
          value={value} onChange={(event) => setValue(event.target.value)} disabled={pending}
          aria-invalid={Boolean(state.errors?.receivingAccount)} aria-describedby="receiving-help receiving-error" />
        <p id="receiving-help" className="field-hint">Enter your public G-address, never a secret key or recovery phrase. Format and checksum are checked; ownership and Testnet activation are not verified yet.</p>
        <p id="receiving-error" className="field-error">{state.errors?.receivingAccount}</p>
      </div>
      <button className="button-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save receiving account"}</button>
      <p className="field-hint mt-4">Changes apply to future invoices. Existing invoices keep their original destination.</p>
    </form>
  );
}
