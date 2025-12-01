// <== IMPORTS ==>
import mongoose from "mongoose";

// <== REFRESH TOKEN SCHEMA ==>
const refreshTokenSchema = new mongoose.Schema(
  {
    // TOKEN ID FIELD
    tokenId: { type: String, required: true, unique: true },
    // USER ID FIELD
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // SESSION ID FIELD (REFERENCE TO SESSION)
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Session",
      default: null,
    },
    // EXPIRES AT FIELD
    expiresAt: { type: Date, required: true },
    // REVOKED FIELD
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// <== INDEXES ==>
/**
 * AUTO DELETING TOKENS WHEN PAST EXPIRATION
 */
//<== AUTO DELETING TOKENS WHEN PAST EXPIRATION ==>
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
/**
 * INDEX FOR SESSION ID
 */
//<== INDEX FOR SESSION ID ==>
refreshTokenSchema.index({ sessionId: 1 }, { sparse: true });
/**
 * COMPOUND INDEX FOR USER AND SESSION
 */
//<== COMPOUND INDEX FOR USER AND SESSION ==>
refreshTokenSchema.index({ userId: 1, sessionId: 1 });

// <== EXPORTING THE REFRESH TOKEN MODEL ==>
export const RefreshToken = mongoose.model("RefreshToken", refreshTokenSchema);
