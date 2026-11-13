export async function hasOwnerSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/v1/auth/session", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return false;
    const data = await response.json() as { authenticated?: boolean };
    return data.authenticated === true;
  } catch {
    return false;
  }
}

export async function openOwnerSession(masterToken: string): Promise<void> {
  if (masterToken.length < 32) throw new Error("Enter the owner master token once.");
  const response = await fetch("/api/v1/auth/session", {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: masterToken }),
  });
  const data = await response.json().catch(() => ({})) as { authenticated?: boolean; error?: string };
  if (!response.ok || data.authenticated !== true) {
    throw new Error(data.error ?? "Secure owner session could not be opened.");
  }
}

export async function ownerFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      ...(init.headers ?? {}),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}
