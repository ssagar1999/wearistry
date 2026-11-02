"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { cities } from "@/lib/data";
import { maskPhone, normalizePhone } from "@/lib/phone";

type Step = "phone" | "code" | "profile";
// "login": log in or sign up. "verify-phone": a logged-in user (e.g. via Google) adds a phone before selling.
type Mode = "login" | "verify-phone";

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in didn't work. Please try again.",
  google_unavailable: "Google sign-in isn't available right now. Use your phone number instead.",
};

type Props = { next: string; startAt?: Step; mode?: Mode; googleEnabled: boolean; initialError?: string };

export default function LoginFlow({ next, startAt = "phone", mode = "login", googleEnabled, initialError }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(startAt);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState(initialError ? (GOOGLE_ERRORS[initialError] ?? "") : "");
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
    const res = await api<{ sent: true; devCode?: string }>("/auth/otp/send", { method: "POST", body: { phone: p } });
    setBusy(false);
    if (!res.ok) { setError(res.message); if (res.retryAfterSeconds) setWait(res.retryAfterSeconds); return; }
    setDevCode(res.data.devCode ?? "");
    setCode("");
    setWait(30);
    setStep("code");
  }

  async function verify(value = code) {
    if (value.length !== 6) return;
    setBusy(true); setError("");
    const res = await api<{ needsProfile: boolean }>("/auth/otp/verify", {
      method: "POST",
      body: { phone: normalizePhone(phone), code: value },
    });
    setBusy(false);
    if (!res.ok) { setError(res.message); setCode(""); return; }
    if (res.data.needsProfile) setStep("profile");
    else done();
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const res = await api("/users/me", { method: "PATCH", body: { name, city } });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    done();
  }

  const input = "w-full rounded-xl border border-line bg-white px-4 py-3.5 text-lg";
  const button = "w-full rounded-full bg-ink py-3.5 font-semibold text-canvas disabled:opacity-40";

  return (
    <div className="mx-auto max-w-sm py-10">
      {step === "phone" && (
        <form onSubmit={sendCode} className="space-y-5">
          <div>
            <h1 className="font-serif text-[32px] leading-tight">
              {mode === "verify-phone" ? "Add your phone number" : "Log in or sign up"}
            </h1>
            <p className="mt-1 text-umber">
              {mode === "verify-phone"
                ? "Buyers and sellers need a verified number. We’ll send a 6-digit code."
                : "We’ll send a 6-digit code to your phone."}
            </p>
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
          {mode === "login" && googleEnabled && (
            <>
              <div className="flex items-center gap-3 text-xs text-umber">
                <span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" />
              </div>
              {/* A full-page navigation, not fetch: the browser must follow the redirects to Google and back. */}
              <a
                href={`/api/v1/auth/google/start?returnTo=${encodeURIComponent(next)}`}
                className="flex w-full items-center justify-center gap-3 rounded-full border border-ink bg-white py-3.5 font-semibold"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                  <path fill="#4285F4" d="M22.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2-1.9 3.2-4.7 3.2-8.1z" />
                  <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1-3.7 1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
                  <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.1a11 11 0 0 0 0 9.8l3.7-2.8z" />
                  <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
                </svg>
                Continue with Google
              </a>
            </>
          )}
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
