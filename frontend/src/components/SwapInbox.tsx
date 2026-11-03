"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Photo from "./Photo";
import { api } from "@/lib/api";
import type { SwapRequest, SwapStatus } from "@/lib/data";

type Box = "received" | "sent";
const STATUS: Record<SwapStatus, { label: string; style: string }> = {
  pending: { label: "Waiting", style: "bg-beige" },
  accepted: { label: "Accepted", style: "bg-forest text-white" },
  declined: { label: "Declined", style: "bg-ink/10 text-umber" },
  cancelled: { label: "Cancelled", style: "bg-ink/10 text-umber" },
};

function ago(at: number) {
  const m = Math.max(1, Math.round((Date.now() - at) / 60000));
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export default function SwapInbox({ initialBox }: { initialBox: Box }) {
  const [box, setBox] = useState<Box>(initialBox);
  const [items, setItems] = useState<SwapRequest[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (which: Box, after?: string) => {
    setError("");
    const res = await api<SwapRequest[]>(`/swap-requests?box=${which}&limit=20${after ? `&cursor=${encodeURIComponent(after)}` : ""}`);
    if (!res.ok) return setError(res.message);
    setItems((current) => (after ? [...(current ?? []), ...res.data] : res.data));
    setCursor(res.meta?.nextCursor ?? null);
  }, []);

  useEffect(() => {
    setItems(null);
    load(box);
  }, [box, load]);

  async function decide(id: string, action: "accept" | "decline" | "cancel") {
    setBusyId(id);
    setError("");
    const res = await api<SwapRequest>(`/swap-requests/${id}`, { method: "PATCH", body: { action } });
    setBusyId(null);
    if (!res.ok) return setError(res.message);
    setItems((current) => current?.map((r) => (r.id === id ? res.data : r)) ?? null);
  }

  const tab = (b: Box, label: string) => (
    <button onClick={() => setBox(b)} aria-pressed={box === b}
      className={`rounded-full px-4 py-2 text-sm font-semibold ${box === b ? "bg-ink text-canvas" : "bg-beige"}`}>{label}</button>
  );

  return (
    <div>
      <div className="flex gap-2">{tab("received", "Received")}{tab("sent", "Sent")}</div>
      {error && <p className="mt-4 text-sm text-terracotta">{error}</p>}
      {items === null && !error && <p className="py-12 text-center text-umber">Loading…</p>}
      {items?.length === 0 && (
        <p className="py-12 text-center text-umber">
          {box === "received" ? "No offers yet. Mark a listing “open to swaps” to get some." : "You haven’t sent any swap requests."}
        </p>
      )}
      <ul className="mt-4 space-y-3">
        {items?.map((r) => (
          <li key={r.id} className="rounded-xl border border-line bg-white p-4">
            <div className="flex items-start gap-3">
              <Link href={`/product/${r.product.id}`} className="h-20 w-16 shrink-0 overflow-hidden rounded bg-beige">
                <Photo src={r.product.image} alt={r.product.title} sizes="64px" />
              </Link>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-serif text-lg leading-tight">{r.product.title}</p>
                  <span className={`label-tag shrink-0 rounded-full px-2.5 py-1 ${STATUS[r.status].style}`}>{STATUS[r.status].label}</span>
                </div>
                <p className="text-xs text-umber">
                  {box === "received" ? "From" : "To"}{" "}
                  <Link href={`/seller/${r.counterpart.id}`} className="font-semibold text-ink underline">{r.counterpart.name}</Link> · {ago(r.createdAt)}
                </p>
              </div>
            </div>
            <p className="mt-3 text-sm"><span className="text-umber">{box === "received" ? "Offering:" : "You offered:"}</span> {r.offer}</p>
            {r.note && <p className="mt-1 text-sm text-umber">“{r.note}”</p>}
            {r.status === "accepted" && r.contactPhone && (
              <p className="mt-3 rounded-lg bg-beige p-3 text-sm">
                Call or WhatsApp {r.counterpart.name}: <a href={`tel:+91${r.contactPhone}`} className="font-semibold underline">+91 {r.contactPhone}</a>
              </p>
            )}
            {r.status === "pending" && (
              <div className="mt-3 flex gap-2">
                {box === "received" ? (
                  <>
                    <button disabled={busyId === r.id} onClick={() => decide(r.id, "accept")} className="flex-1 rounded-full bg-forest py-2.5 text-sm font-semibold text-white disabled:opacity-50">Accept</button>
                    <button disabled={busyId === r.id} onClick={() => decide(r.id, "decline")} className="flex-1 rounded-full border border-ink py-2.5 text-sm font-semibold disabled:opacity-50">Decline</button>
                  </>
                ) : (
                  <button disabled={busyId === r.id} onClick={() => decide(r.id, "cancel")} className="rounded-full border border-ink px-5 py-2.5 text-sm font-semibold disabled:opacity-50">Cancel request</button>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {cursor && (
        <div className="mt-6 text-center">
          <button onClick={() => load(box, cursor)} className="rounded-full border border-ink px-6 py-3 text-sm font-semibold">Load more</button>
        </div>
      )}
    </div>
  );
}
