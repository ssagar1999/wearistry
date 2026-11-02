"use client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); router.replace("/"); router.refresh(); }}
      className="w-full rounded-full border border-ink py-3 font-semibold"
    >
      Log out
    </button>
  );
}
