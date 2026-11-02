import { createSession } from "../../src/modules/auth/session.service.js";
import { User } from "../../src/modules/users/user.model.js";

let counter = 0;

/**
 * Creates a user directly in the database and returns a session cookie for them, skipping the OTP flow
 * (which has its own tests).
 *
 * @param {{ name?: string, city?: string, phone?: string | null }} [profile] phone null = no verified phone
 */
export async function createUserWithSession(profile = {}) {
  counter += 1;
  const phone =
    profile.phone === null ? undefined : (profile.phone ?? `9${String(100000000 + counter).slice(-9)}`);
  const user = await User.create({
    name: profile.name ?? `Tester ${counter}`,
    city: profile.city ?? "Pune",
    ...(phone && { phone, phoneVerifiedAt: new Date() }),
  });
  const { token } = await createSession(user.uid, 1);
  return { user, cookie: `wearistry_sid=${token}` };
}
