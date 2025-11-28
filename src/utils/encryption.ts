// <== IMPORTS ==>
import crypto from "crypto";
import bcrypt from "bcryptjs";

// <== ENCRYPTION KEY FROM ENVIRONMENT ==>
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
// IF ENCRYPTION KEY IS NOT SET, THROW ERROR
if (!ENCRYPTION_KEY) {
  // THROWING ERROR
  throw new Error(
    "ENCRYPTION_KEY Environment Variable is Required for 2FA Functionality!"
  );
}
// <== ENCRYPTION KEY VALUE ==>
const ENCRYPTION_KEY_VALUE: string = ENCRYPTION_KEY;
// <== ALGORITHM ==>
const ALGORITHM = "aes-256-gcm";
// <== IV LENGTH ==>
const IV_LENGTH = 16;

/**
 * ENCRYPT TOTP SECRET
 * @param secret - TOTP Secret to Encrypt
 * @returns Encrypted Secret
 */
export const encryptSecret = (secret: string): string => {
  // GENERATING RANDOM IV
  const iv = crypto.randomBytes(IV_LENGTH);
  // ENSURE ENCRYPTION KEY IS 32 BYTES (64 HEX CHARACTERS)
  const keyBuffer =
    ENCRYPTION_KEY_VALUE.length === 64
      ? Buffer.from(ENCRYPTION_KEY_VALUE, "hex")
      : crypto.createHash("sha256").update(ENCRYPTION_KEY_VALUE).digest();
  // CREATING CIPHER
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  // ENCRYPTING SECRET
  let encrypted = cipher.update(secret, "utf8", "hex");
  // FINALIZING ENCRYPTION
  encrypted += cipher.final("hex");
  // GETTING AUTH TAG
  const authTag = cipher.getAuthTag();
  // RETURNING ENCRYPTED SECRET WITH IV AND AUTH TAG
  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted;
};

/**
 * DECRYPT TOTP SECRET
 * @param encryptedSecret - Encrypted Secret
 * @returns Decrypted Secret
 */
export const decryptSecret = (encryptedSecret: string): string => {
  // SPLITTING ENCRYPTED SECRET INTO PARTS
  const parts = encryptedSecret.split(":");
  // IF PARTS ARE INVALID, THROW ERROR
  if (parts.length !== 3) {
    // THROWING ERROR
    throw new Error("Invalid Encrypted Secret Format!");
  }
  // EXTRACTING IV, AUTH TAG, AND ENCRYPTED DATA
  const [ivHex, authTagHex, encrypted] = parts;
  // VALIDATING THAT ALL PARTS EXIST
  if (!ivHex || !authTagHex || !encrypted) {
    // THROWING ERROR
    throw new Error("Invalid Encrypted Secret Format: Missing Required Parts!");
  }
  // CONVERTING HEX STRINGS TO BUFFERS
  const iv = Buffer.from(ivHex, "hex");
  // CONVERTING AUTH TAG HEX STRING TO BUFFER
  const authTag = Buffer.from(authTagHex, "hex");
  // ENSURE ENCRYPTION KEY IS 32 BYTES (64 HEX CHARACTERS)
  const keyBuffer =
    ENCRYPTION_KEY_VALUE.length === 64
      ? Buffer.from(ENCRYPTION_KEY_VALUE, "hex")
      : crypto.createHash("sha256").update(ENCRYPTION_KEY_VALUE).digest();
  // CREATING DECIPHER
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
  // SETTING AUTH TAG
  decipher.setAuthTag(authTag);
  // DECRYPTING SECRET
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  // FINALIZING DECRYPTION
  decrypted += decipher.final("utf8");
  // RETURNING DECRYPTED SECRET
  return decrypted;
};

/**
 * HASH BACKUP CODE
 * @param code - Backup Code to Hash
 * @returns Hashed Backup Code
 */
export const hashBackupCode = async (code: string): Promise<string> => {
  // HASHING BACKUP CODE WITH BCRYPT
  const hashedCode = await bcrypt.hash(code, 10);
  // RETURNING HASHED CODE
  return hashedCode;
};

/**
 * VERIFY BACKUP CODE
 * @param code - Backup Code to Verify
 * @param hashedCode - Hashed Backup Code
 * @returns Boolean indicating if code matches
 */
export const verifyBackupCode = async (
  code: string,
  hashedCode: string
): Promise<boolean> => {
  // COMPARING BACKUP CODE WITH HASHED CODE
  const isMatch = await bcrypt.compare(code, hashedCode);
  // RETURNING MATCH RESULT
  return isMatch;
};
