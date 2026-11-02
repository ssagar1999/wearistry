import { z } from "zod";

/** Accepts "98765 43210", "+91 98765-43210" or "098765…" and returns the 10-digit Indian mobile number. */
export const indianMobile = z
  .string()
  .max(20)
  .transform((value, ctx) => {
    let digits = value.replace(/\D/g, "");
    if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
    else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
    if (!/^[6-9]\d{9}$/.test(digits)) {
      ctx.addIssue({ code: "custom", message: "Enter a 10-digit Indian mobile number." });
      return z.NEVER;
    }
    return digits;
  })
  .meta({ example: "9876543210" });

export const sendOtpBody = z.object({ phone: indianMobile }).strict();

export const verifyOtpBody = z
  .object({ phone: indianMobile, code: z.string().regex(/^\d{6}$/, "Enter the 6-digit code.") })
  .strict();

/** Where to go after Google sign-in: only a path on our own site, so it can't become an open redirect. */
export const safeReturnTo = z
  .string()
  .max(300)
  .refine((path) => path.startsWith("/") && !path.startsWith("//") && !path.includes("\\"), "Invalid path.")
  .catch("/")
  .default("/");

export const googleStartQuery = z.object({ returnTo: safeReturnTo }).strip();
