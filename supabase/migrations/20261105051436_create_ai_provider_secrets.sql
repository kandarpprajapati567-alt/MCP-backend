create table if not exists public.ai_provider_secrets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('openai','anthropic','google','openrouter')),
  encrypted_secret text not null,
  iv text not null,
  auth_tag text not null,
  key_version integer not null default 1 check (key_version = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_provider_secrets_user_id_provider_key unique (user_id, provider)
);

alter table public.ai_provider_secrets enable row level security;
revoke all on public.ai_provider_secrets from public, anon, authenticated;
grant select, insert, update, delete on public.ai_provider_secrets to service_role;
comment on table public.ai_provider_secrets is
  'Server-only encrypted AI provider credentials. No direct Data API access.';
