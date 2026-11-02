// Sends one test OTP SMS through MSG91 using the keys in .env.local.
// Usage: npm run sms:test -- 98765XXXXX
const phone = (process.argv[2] ?? "").replace(/\D/g, "").replace(/^(91|0)(?=\d{10}$)/, "");
const { MSG91_AUTH_KEY: key, MSG91_TEMPLATE_ID: template } = process.env;

if (!/^[6-9]\d{9}$/.test(phone)) {
  console.error("Give a 10-digit Indian mobile number: npm run sms:test -- 98765XXXXX");
  process.exit(1);
}
if (!key || !template) {
  console.error("Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID in .env.local first.");
  process.exit(1);
}

const otp = String(Math.floor(Math.random() * 1e6)).padStart(6, "0");
const qs = new URLSearchParams({ template_id: template, mobile: `91${phone}`, otp, otp_length: "6", otp_expiry: "5", realTimeResponse: "1" });
const res = await fetch(`https://control.msg91.com/api/v5/otp?${qs}`, {
  method: "POST",
  headers: { authkey: key, "content-type": "application/json" },
  body: "{}",
});
const body = await res.json().catch(() => ({}));
console.log(`HTTP ${res.status}`, body);
if (res.ok && body.type === "success") console.log(`Sent. The SMS should show code ${otp}.`);
else {
  console.error("Not sent. Check the auth key, template ID and DLT approval (see docs/SMS_SETUP.md).");
  process.exit(1);
}
