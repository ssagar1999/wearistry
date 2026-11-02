const MSG91_OTP_URL = "https://control.msg91.com/api/v5/otp";
const TIMEOUT_MS = 10_000;

/**
 * Sends an OTP SMS through MSG91 (SendOTP v5). We generate and verify the code ourselves; MSG91 only
 * delivers it. MSG91 can report failures with HTTP 200, so the response body is checked too.
 *
 * @param {{ authKey: string, templateId: string }} config
 * @param {{ phone: string, code: string, expiryMinutes: number }} message
 */
export async function sendOtpSms(config, { phone, code, expiryMinutes }) {
  const query = new URLSearchParams({
    template_id: config.templateId,
    mobile: `91${phone}`,
    otp: code,
    otp_length: String(code.length),
    otp_expiry: String(expiryMinutes),
    realTimeResponse: "1",
  });
  const response = await fetch(`${MSG91_OTP_URL}?${query}`, {
    method: "POST",
    headers: { authkey: config.authKey, "content-type": "application/json" },
    body: "{}",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = /** @type {{ type?: string, message?: string }} */ (await response.json().catch(() => ({})));
  if (!response.ok || body.type !== "success") {
    throw new Error(`MSG91 send failed (HTTP ${response.status}): ${body.message ?? "no message"}`);
  }
}
