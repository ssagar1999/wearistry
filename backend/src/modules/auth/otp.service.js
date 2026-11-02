import { randomInt } from "node:crypto";
import mongoose from "mongoose";
import { ApiError, ErrorCode } from "../../utils/api-error.js";
import { hmac, safeEqual } from "./auth.crypto.js";
import { OtpChallenge } from "./otp-challenge.model.js";
import { sendOtpSms } from "./sms.client.js";

const CODE_TTL_MS = 5 * 60_000;
const RESEND_AFTER_MS = 30_000;
const SEND_WINDOW_MS = 60 * 60_000;
const MAX_SENDS_PER_WINDOW = 5;
const MAX_ATTEMPTS = 5;
const MONGO_DUPLICATE_KEY = 11000;

/** @typedef {import("../../config/env.js").Env} Env */

/** @param {number} seconds @param {string} message */
const rateLimited = (seconds, message) =>
  new ApiError(429, ErrorCode.RATE_LIMITED, message, { retryAfterSeconds: Math.max(1, Math.ceil(seconds)) });

/**
 * @param {Pick<Env, "AUTH_SECRET" | "OTP_DEV_CODES" | "MSG91_AUTH_KEY" | "MSG91_TEMPLATE_ID">} env
 * @param {import("pino").Logger} logger
 */
export function createOtpService(env, logger) {
  const hashCode = (/** @type {string} */ phone, /** @type {string} */ code) =>
    hmac(env.AUTH_SECRET, `otp:${phone}:${code}`);

  /**
   * Stores a new code if the phone is within its send limits, in one atomic operation: two simultaneous
   * requests can't both pass the "30 seconds since the last send" check.
   *
   * @param {string} phone
   * @param {string} codeHash
   */
  async function storeChallenge(phone, codeHash) {
    const now = new Date();
    const windowExpired = { $lte: ["$windowStartedAt", new Date(now.getTime() - SEND_WINDOW_MS)] };
    const fresh = {
      codeHash,
      codeExpiresAt: new Date(now.getTime() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: now,
      expireAt: new Date(now.getTime() + SEND_WINDOW_MS),
    };

    const { matchedCount } = await OtpChallenge.updateOne(
      {
        phone,
        lastSentAt: mongoose.trusted({ $lte: new Date(now.getTime() - RESEND_AFTER_MS) }),
        $or: [
          { windowStartedAt: mongoose.trusted({ $lte: new Date(now.getTime() - SEND_WINDOW_MS) }) },
          { sendsInWindow: mongoose.trusted({ $lt: MAX_SENDS_PER_WINDOW }) },
        ],
      },
      [
        {
          $set: {
            ...fresh,
            windowStartedAt: { $cond: [windowExpired, now, "$windowStartedAt"] },
            sendsInWindow: { $cond: [windowExpired, 1, { $add: ["$sendsInWindow", 1] }] },
          },
        },
      ],
      { updatePipeline: true },
    );
    if (matchedCount === 1) return;

    // Nothing matched: either this phone has no challenge yet, or it is over a limit.
    try {
      await OtpChallenge.create({ phone, ...fresh, windowStartedAt: now, sendsInWindow: 1 });
    } catch (error) {
      if (/** @type {{ code?: unknown }} */ (error).code !== MONGO_DUPLICATE_KEY) throw error;
      throw await explainLimit(phone, now);
    }
  }

  /** @param {string} phone @param {Date} now */
  async function explainLimit(phone, now) {
    const existing = await OtpChallenge.findOne({ phone }, { lastSentAt: 1, windowStartedAt: 1 }).lean();
    if (!existing) return rateLimited(1, "Please try again."); // expired between our two queries
    const sinceLastSend = now.getTime() - existing.lastSentAt.getTime();
    if (sinceLastSend < RESEND_AFTER_MS) {
      return rateLimited(
        (RESEND_AFTER_MS - sinceLastSend) / 1000,
        "Please wait a moment before asking for another code.",
      );
    }
    const windowEndsIn = existing.windowStartedAt.getTime() + SEND_WINDOW_MS - now.getTime();
    return rateLimited(windowEndsIn / 1000, "Too many codes requested for this number. Try again later.");
  }

  return {
    /**
     * Sends a 6-digit login code. Returns the code itself only when OTP_DEV_CODES is on (never in production).
     *
     * @param {string} phone 10-digit Indian mobile number
     * @returns {Promise<{ devCode?: string }>}
     */
    async sendCode(phone) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
      await storeChallenge(phone, hashCode(phone, code));

      if (env.OTP_DEV_CODES) return { devCode: code };
      if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) {
        logger.error("OTP requested but MSG91 is not configured");
        throw new ApiError(503, ErrorCode.SERVICE_UNAVAILABLE, "Phone login is not available right now.");
      }
      try {
        await sendOtpSms(
          { authKey: env.MSG91_AUTH_KEY, templateId: env.MSG91_TEMPLATE_ID },
          { phone, code, expiryMinutes: CODE_TTL_MS / 60_000 },
        );
      } catch (error) {
        logger.error({ err: error }, "Sending OTP SMS failed");
        throw new ApiError(503, ErrorCode.SERVICE_UNAVAILABLE, "We couldn't send the SMS. Please try again.");
      }
      return {};
    },

    /**
     * Checks a code. Each check uses up one attempt atomically, and a correct code can be used only once.
     *
     * @param {string} phone
     * @param {string} code
     */
    async verifyCode(phone, code) {
      const challenge = await OtpChallenge.findOneAndUpdate(
        {
          phone,
          codeExpiresAt: mongoose.trusted({ $gt: new Date() }),
          attempts: mongoose.trusted({ $lt: MAX_ATTEMPTS }),
        },
        { $inc: { attempts: 1 } },
        { returnDocument: "after", projection: { codeHash: 1 } },
      ).lean();
      if (!challenge) {
        throw ApiError.unauthenticated(
          "That code has expired or had too many wrong tries. Request a new one.",
        );
      }
      if (!safeEqual(hashCode(phone, code), challenge.codeHash)) {
        throw ApiError.unauthenticated("That code isn't right. Check the SMS and try again.");
      }
      // Deleting by the matched hash makes the code single-use even if two requests verify at once.
      const { deletedCount } = await OtpChallenge.deleteOne({ phone, codeHash: challenge.codeHash });
      if (deletedCount !== 1)
        throw ApiError.unauthenticated("That code was already used. Request a new one.");
    },
  };
}
