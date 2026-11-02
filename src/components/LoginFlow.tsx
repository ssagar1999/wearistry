"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cities } from "@/lib/data";
import { maskPhone, normalizePhone } from "@/lib/phone";

type Step = "phone" | "code" | "profile";

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: await res.json().catch(() => ({})) };
};

export default function LoginFlow({ next, startAt = "phone" }: { next: string; startAt?: Step }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startAt);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(wait - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);
  useEffect(() => { if (step === "code") codeRef.current?.focus(); }, [step]);

  const done = () => { router.replace(next); router.refresh(); };

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const p = normalizePhone(phone);
    if (!p) return setError("Enter a 10-digit Indian mobile number.");
    setBusy(true); setError("");
    const { ok, data } = await post("/api/auth/send", { phone: p });
    setBusy(false);
    if (!ok) { setError(data.error ?? "Something went wrong."); if (data.retryIn) setWait(data.retryIn); return; }
    setDevCode(data.devCode ?? "");
    setCode("");
    setWait(30);
    setStep("code");
  }

  async function verify(value = code) {
    if (value.length !== 6) return;
    setBusy(true); setError("");
    const { ok, data } = await post("/api/auth/verify", { phone: normalizePhone(phone), code: value });
    setBusy(false);
    if (!ok) { setError(data.error ?? "Something went wrong."); setCode(""); return; }
    if (data.needsProfile) setStep("profile");
    else done();
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const { ok, data } = await post("/api/auth/profile", { name, city });
    setBusy(false);
    if (!ok) return setError(data.error ?? "Something went wrong.");
    done();
  }

  const input = "w-full rounded-xl border border-line bg-white px-4 py-3.5 text-lg";
  const button = "w-full rounded-full bg-ink py-3.5 font-semibold text-canvas disabled:opacity-40";

  return (
    <div className="mx-auto max-w-sm py-10">
      {step === "phone" && (
        <form onSubmit={sendCode} className="space-y-5">
          <div>
            <h1 className="font-serif text-[32px] leading-tight">Log in or sign up</h1>
            <p className="mt-1 text-umber">We’ll send a 6-digit code to your phone.</p>
          </div>
          <label className="block text-sm font-medium">
            Mobile number
            <div className="mt-1 flex items-center rounded-xl border border-line bg-white focus-within:border-ink">
              <span className="border-r border-line px-4 py-3.5 text-lg text-umber">+91</span>
              <input autoFocus type="tel" inputMode="numeric" autoComplete="tel-national" maxLength={14}
                value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210"
                className="min-w-0 flex-1 rounded-r-xl bg-transparent px-4 py-3.5 text-lg outline-none" />
            </div>
          </label>
          {error && <p className="text-sm text-terracotta">{error}</p>}
          <button disabled={busy || !normalizePhone(phone) || wait > 0} className={button}>
            {busy ? "Sending…" : wait > 0 ? `Wait ${wait}s` : "Send code"}
          </button>
          <p className="text-center text-xs text-umber">Indian mobile numbers only. Standard SMS rates may apply.</p>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={(e) => { e.preventDefault(); verify(); }} className="space-y-5">
          <div>
            <h1 className="font-serif text-[32px] leading-tight">Enter the code</h1>
            <p className="mt-1 text-umber">
              Sent to {maskPhone(normalizePhone(phone)!)} ·{" "}
              <button type="button" onClick={() => { setStep("phone"); setError(""); }} className="font-semibold text-ink underline">Change</button>
            </p>
          </div>
          {devCode && (
            <p className="rounded-lg bg-beige p-3 text-sm">Dev mode, no SMS sent. Your code is <b className="tracking-widest">{devCode}</b></p>
          )}
          <input ref={codeRef} type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
            value={code} placeholder="••••••" aria-label="6-digit code"
            onChange={(e) => { const v = e.target.value.replace(/\D/g, "").slice(0, 6); setCode(v); if (v.length === 6) verify(v); }}
            className={`${input} text-center text-2xl tracking-[0.5em]`} />
          {error && <p className="text-sm text-terracotta">{error}</p>}
          <button disabled={busy || code.length !== 6} className={button}>{busy ? "Checking…" : "Verify"}</button>
          <button type="button" disabled={wait > 0 || busy} onClick={() => sendCode()} className="w-full text-sm font-semibold underline disabled:no-underline disabled:opacity-50">
            {wait > 0 ? `Resend code in ${wait}s` : "Resend code"}
          </button>
        </form>
      )}

      {step === "profile" && (
        <form onSubmit={saveProfile} className="space-y-5">
          <div>
            <h1 className="font-serif text-[32px] leading-tight">Welcome to Wearistry</h1>
            <p className="mt-1 text-umber">What should buyers and sellers call you?</p>
          </div>
          <label className="block text-sm font-medium">Your name
            <input autoFocus required minLength={2} maxLength={40} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Priya Sharma" className={`mt-1 ${input}`} />
          </label>
          <label className="block text-sm font-medium">City
            <input list="cities" maxLength={40} value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Pune" className={`mt-1 ${input}`} />
            <datalist id="cities">{cities.map((c) => <option key={c} value={c} />)}</datalist>
          </label>
          {error && <p className="text-sm text-terracotta">{error}</p>}
          <button disabled={busy || name.trim().length < 2} className={button}>{busy ? "Saving…" : "Continue"}</button>
        </form>
      )}
    </div>
  );
}
