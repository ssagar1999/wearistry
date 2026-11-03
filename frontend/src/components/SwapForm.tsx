"use client";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import type { SwapRequest } from "@/lib/data";

export default function SwapForm({ productId, productTitle }: { productId: string; productTitle: string }) {
  const [offer, setOffer] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const field = "mt-1 w-full rounded-xl border border-line bg-white px-4 py-3 text-base";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await api<SwapRequest>("/swap-requests", { method: "POST", body: { productId, offer, note } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setSent(true);
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-xl bg-beige p-5">
        <p className="font-serif text-xl">Request sent</p>
        <p className="mt-1 text-sm text-umber">
          The seller will see your offer for {productTitle}. When they accept, you’ll both see each other’s phone number to arrange the swap.
        </p>
        <Link href="/swaps?box=sent" className="mt-4 inline-block rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-canvas">View my requests</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-4 text-sm font-medium">
      <label className="block">What are you offering?
        <input required minLength={2} maxLength={300} value={offer} onChange={(e) => setOffer(e.target.value)}
          placeholder="e.g. Block-print kurta, size M, barely worn" className={field} />
      </label>
      <label className="block">Anything to add? <span className="font-normal text-umber">(optional)</span>
        <textarea maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)}
          placeholder="Your city, when you can meet or ship…" className={field} />
      </label>
      {error && <p className="text-terracotta">{error}</p>}
      <button disabled={busy || offer.trim().length < 2} className="w-full rounded-full bg-forest py-3.5 font-semibold text-white disabled:opacity-40">
        {busy ? "Sending…" : "Send swap request"}
      </button>
    </form>
  );
}
