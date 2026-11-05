import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { decryptProviderSecret } from "./encryption";

export type StoredAIProvider = "openai" | "anthropic" | "google" | "openrouter";

interface EncryptedProviderSecret {
  encrypted_secret: string;
  iv: string;
  auth_tag: string;
  key_version: number;
}

/**
 * Loads and decrypts a credential for the authenticated owner.
 * This module is server-only; plaintext credentials must never be returned
 * from an API route or included in logs, task events, or model responses.
 */
export async function loadProviderSecret(
  userId: string,
  provider: StoredAIProvider,
): Promise<string | null> {
  if (!userId || typeof userId !== "string") {
    throw new Error("An authenticated user is required.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("ai_provider_secrets")
    .select("encrypted_secret, iv, auth_tag, key_version")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    // Do not include database details or secret material in thrown errors.
    throw new Error("Unable to load provider credentials.");
  }

  if (!data) return null;

  const encrypted = data as EncryptedProviderSecret;
  try {
    return decryptProviderSecret(encrypted);
  } catch {
    // This can indicate a wrong encryption key or unsupported key version.
    // Never log the encrypted row or decrypted value.
    throw new Error("Stored provider credential could not be decrypted.");
  }
}
