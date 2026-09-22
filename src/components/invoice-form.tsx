"use client";

import { useActionState, useState } from "react";
import { createInvoice } from "@/server/invoices/actions";

export function InvoiceForm() {
  const [state, action, pending] = useActionState(createInvoice, {});
  const [values, setValues] = useState({ customerName: "", customerEmail: "", description: "", amount: "", dueDate: "" });
  const fields = [
    { name: "customerName", label: "Customer name", type: "text", max: 120 },
    { name: "customerEmail", label: "Customer email", type: "email", max: 254 },
    { name: "amount", label: "Amount in XLM", type: "text", max: 32 },
    { name: "dueDate", label: "Due date", type: "date", max: 10 },
  ] as const;

  return (
    <form action={action} className="merchant-form">
      <p className="muted">Issued invoices cannot be edited in this milestone. Check the details before creating one.</p>
      {state.message && <div className="auth-notice" role="alert">{state.message}{state.errors?.receivingAccount && <p>{state.errors.receivingAccount}</p>}</div>}
      <fieldset disabled={pending}>
        {fields.map(({ name, label, type, max }) => (
          <div className="form-field" key={name}>
            <label htmlFor={name}>{label}</label>
            <input id={name} name={name} type={type} maxLength={max} required
              inputMode={name === "amount" ? "decimal" : undefined}
              min={name === "dueDate" ? "1900-01-01" : undefined}
              max={name === "dueDate" ? "9999-12-31" : undefined}
              value={values[name]} onChange={(event) => setValues({ ...values, [name]: event.target.value })}
              aria-invalid={Boolean(state.errors?.[name])}
              aria-describedby={`${name}-help`} />
            <p id={`${name}-help`} className={state.errors?.[name] ? "field-error" : "field-hint"}>
              {state.errors?.[name] || (name === "amount" ? "Use up to 7 decimal places. Testnet XLM only." : name === "customerEmail" ? "Kept private; not shown on the public invoice." : "")}
            </p>
          </div>
        ))}
        <div className="form-field">
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" rows={5} maxLength={2000} required value={values.description}
            onChange={(event) => setValues({ ...values, description: event.target.value })}
            aria-invalid={Boolean(state.errors?.description)} aria-describedby="description-help" />
          <p id="description-help" className={state.errors?.description ? "field-error" : "field-hint"}>
            {state.errors?.description || "Visible to anyone with the public link. Avoid confidential information."}
          </p>
        </div>
        <button className="button-primary" type="submit" disabled={pending}>{pending ? "Creating invoice…" : "Create invoice"}</button>
      </fieldset>
      <span className="sr-only" role="status">{pending ? "Creating invoice. Please wait." : ""}</span>
    </form>
  );
}
