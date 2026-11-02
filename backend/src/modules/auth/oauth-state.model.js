import mongoose from "mongoose";

/**
 * `oauth_states`: data that must survive the round trip to Google and back (PKCE verifier, nonce, where to
 * send the user afterwards). Looked up once by the hashed `state`, then deleted; leftovers expire in minutes.
 */
const oauthStateSchema = new mongoose.Schema(
  {
    stateHash: { type: String, required: true },
    codeVerifier: { type: String, required: true },
    nonce: { type: String, required: true },
    returnTo: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { collection: "oauth_states" },
);

oauthStateSchema.index({ stateHash: 1 }, { unique: true });
oauthStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthState = mongoose.models.OAuthState ?? mongoose.model("OAuthState", oauthStateSchema);
