import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID } from "@/server/security/owner-auth";
import { decryptProviderSecret } from "@/server/ai/secrets/encryption";
import { searchWebWithKey } from "./web-search-core";

export async function searchWeb(args: Record<string, unknown>) {
  const { data, error } = await createAdminClient().from("integration_connections")
    .select("encrypted_secret,iv,auth_tag,key_version")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("provider", "tavily").eq("enabled", true).maybeSingle();
  if (error) throw new Error("Web Search connection could not be loaded.");
  if (!data) throw new Error("Web Search is not connected. Add a Tavily API key in Dashboard → Connections.");
  let apiKey: string;
  try {
    apiKey = decryptProviderSecret(data);
  } catch {
    throw new Error("Stored Web Search credential could not be decrypted.");
  }
  return searchWebWithKey(args, apiKey);
}
