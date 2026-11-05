import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer {
  const encoded = process.env.AI_PROVIDER_ENCRYPTION_KEY;
  if (!encoded) throw new Error("Server configuration is incomplete.");

  let key: Buffer;
  try {
    key = Buffer.from(encoded, "base64");
  } catch {
    throw new Error("Server configuration is invalid.");
  }

  if (key.length !== 32) {
    throw new Error("Server configuration is invalid.");
  }
  return key;
}

export function encryptProviderSecret(plaintext: string) {
  if (typeof plaintext !== "string" || plaintext.length < 8 || plaintext.length > 4096) {
    throw new Error("Provider credential is invalid.");
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);

  return {
    encrypted_secret: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    auth_tag: cipher.getAuthTag().toString("base64"),
    key_version: 1,
  };
}

export function decryptProviderSecret(input: {
  encrypted_secret: string;
  iv: string;
  auth_tag: string;
  key_version: number;
}): string {
  if (input.key_version !== 1) throw new Error("Unsupported encryption key version.");

  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(input.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(input.auth_tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(input.encrypted_secret, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
