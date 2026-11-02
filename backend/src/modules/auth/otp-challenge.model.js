import mongoose from "mongoose";

/**
 * `otp_challenges`: at most one small document per phone number, holding the current code hash and the
 * send/attempt counters used for rate limiting. Counters are fields, not an array of timestamps, so the
 * document size is fixed and updates stay atomic. The whole document expires an hour after the last send.
 */
const otpChallengeSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    codeHash: { type: String, required: true },
    codeExpiresAt: { type: Date, required: true },
    attempts: { type: Number, required: true, default: 0 },
    lastSentAt: { type: Date, required: true },
    windowStartedAt: { type: Date, required: true },
    sendsInWindow: { type: Number, required: true, default: 1 },
    expireAt: { type: Date, required: true },
  },
  { collection: "otp_challenges" },
);

otpChallengeSchema.index({ phone: 1 }, { unique: true });
otpChallengeSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

export const OtpChallenge =
  mongoose.models.OtpChallenge ?? mongoose.model("OtpChallenge", otpChallengeSchema);
