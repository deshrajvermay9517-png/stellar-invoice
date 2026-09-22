"use client";

import { useState } from "react";

export function PublicLink({ url }: { url: string }) {
  const [message, setMessage] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(url); setMessage("Link copied."); }
    catch { setMessage("Copy is unavailable. Select and copy the link below."); }
  }
  return (
    <div className="public-link-box">
      <label htmlFor="public-link">Public invoice link</label>
      <input id="public-link" readOnly value={url} onFocus={(event) => event.target.select()} />
      <div className="utility-actions"><button type="button" className="button-secondary" onClick={copy}>Copy link</button><a className="button-secondary" href={url} referrerPolicy="no-referrer">Open public invoice</a></div>
      <p role="status" className="field-hint">{message}</p>
      <p className="field-hint">Anyone with this link can view the invoice. Customer email stays private.</p>
    </div>
  );
}
