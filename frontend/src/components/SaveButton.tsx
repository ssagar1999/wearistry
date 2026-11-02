"use client";
import { useEffect, useState } from "react";

const KEY = "wearistry-saved";
const read = (): string[] => {
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
};

export function useSaved() {
  const [saved, setSaved] = useState<string[]>([]);
  useEffect(() => setSaved(read()), []);
  const toggle = (id: string) => {
    const next = read().includes(id) ? read().filter((x) => x !== id) : [...read(), id];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
    setSaved(next);
  };
  return { saved, toggle };
}

export default function SaveButton({ id, className = "" }: { id: string; className?: string }) {
  const { saved, toggle } = useSaved();
  const on = saved.includes(id);
  return (
    <button
      aria-label={on ? "Remove from saved" : "Save"}
      onClick={(e) => { e.preventDefault(); toggle(id); }}
      className={`flex h-8 w-8 items-center justify-center rounded-full bg-canvas text-lg ${on ? "text-terracotta" : "text-ink"} ${className}`}
    >
      {on ? "♥" : "♡"}
    </button>
  );
}
