-- Secure one-time pairing codes and per-device bearer credentials.
-- Plaintext pairing codes and device tokens are never persisted.

create table if not exists public.agent_device_pairing_codes (
  code_hash text primary key check (char_length(code_hash) = 64),
  owner_id uuid not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_device_pairing_codes_owner_created_idx
  on public.agent_device_pairing_codes(owner_id, created_at desc);
alter table public.agent_device_pairing_codes enable row level security;
revoke all on public.agent_device_pairing_codes from public, anon, authenticated;
grant select, insert, update, delete on public.agent_device_pairing_codes to service_role;

create table if not exists public.agent_device_credentials (
  token_hash text primary key check (char_length(token_hash) = 64),
  owner_id uuid not null,
  device_id text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  foreign key (owner_id, device_id)
    references public.agent_devices(owner_id, device_id) on delete cascade
);
create index if not exists agent_device_credentials_owner_device_idx
  on public.agent_device_credentials(owner_id, device_id) where revoked_at is null;
alter table public.agent_device_credentials enable row level security;
revoke all on public.agent_device_credentials from public, anon, authenticated;
grant select, insert, update, delete on public.agent_device_credentials to service_role;

create or replace function public.claim_agent_device_pairing(
  p_code_hash text,
  p_owner_id uuid,
  p_device_id text,
  p_display_name text,
  p_platform text,
  p_app_version text,
  p_capabilities jsonb,
  p_token_hash text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pairing public.agent_device_pairing_codes%rowtype;
  registered public.agent_devices%rowtype;
begin
  select * into pairing
    from public.agent_device_pairing_codes
    where code_hash = p_code_hash and owner_id = p_owner_id
    for update;

  if not found or pairing.consumed_at is not null or pairing.expires_at <= now() then
    raise exception 'PAIRING_CODE_INVALID_OR_EXPIRED';
  end if;

  update public.agent_device_pairing_codes
    set consumed_at = now()
    where code_hash = p_code_hash;

  insert into public.agent_devices (
    owner_id, device_id, display_name, platform, app_version,
    capabilities, status, last_seen_at
  ) values (
    p_owner_id, p_device_id, p_display_name, p_platform, p_app_version,
    p_capabilities, 'online', now()
  )
  on conflict (owner_id, device_id) do update set
    display_name = excluded.display_name,
    platform = excluded.platform,
    app_version = excluded.app_version,
    capabilities = excluded.capabilities,
    status = 'online',
    last_seen_at = now(),
    updated_at = now()
  returning * into registered;

  -- A fresh pairing replaces any previous credentials for this device.
  update public.agent_device_credentials
    set revoked_at = now()
    where owner_id = p_owner_id and device_id = p_device_id and revoked_at is null;

  insert into public.agent_device_credentials(token_hash, owner_id, device_id)
    values (p_token_hash, p_owner_id, p_device_id);

  return jsonb_build_object(
    'deviceId', registered.device_id,
    'displayName', registered.display_name,
    'platform', registered.platform,
    'status', registered.status
  );
end;
$$;

revoke all on function public.claim_agent_device_pairing(text, uuid, text, text, text, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_agent_device_pairing(text, uuid, text, text, text, text, jsonb, text) to service_role;
