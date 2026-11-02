"use client";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => { await api("/auth/logout", { method: "POST" }); router.replace("/"); router.refresh(); }}
      className="w-full rounded-full border border-ink py-3 font-semibold"
    >
      Log out
    </button>
  );
}
