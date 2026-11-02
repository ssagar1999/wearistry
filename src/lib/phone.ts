// Accepts "98765 43210", "+91 98765-43210", "098765..." and returns the 10-digit Indian mobile, or null.
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d) ? d : null;
}

export const maskPhone = (p: string) => `+91 ${p.slice(0, 2)}••• ••${p.slice(7)}`;
