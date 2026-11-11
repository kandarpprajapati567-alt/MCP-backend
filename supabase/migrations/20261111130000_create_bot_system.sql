-- Persistent owner-managed Bots and their conversations.
-- All access is through owner-token protected server routes and service_role.

create table if not exists public.bot_definitions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  persona_instructions text not null check (char_length(persona_instructions) between 1 and 12000),
  agent_ids uuid[] not null check (cardinality(agent_ids) between 1 and 20),
  default_agent_id uuid references public.agent_definitions(id) on delete set null,
  provider_preference text not null default 'auto'
    check (provider_preference in ('auto','openai','openrouter','mock')),
  model_preference text check (model_preference is null or char_length(model_preference) between 1 and 160),
  allowed_tools text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, name),
  check (default_agent_id is null or default_agent_id = any(agent_ids))
);

create index if not exists bot_definitions_owner_updated_idx
  on public.bot_definitions(owner_id, updated_at desc);

create table if not exists public.bot_conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  bot_id uuid not null references public.bot_definitions(id) on delete cascade,
  last_agent_id uuid references public.agent_definitions(id) on delete set null,
  last_task_id uuid references public.agent_tasks(id) on delete set null,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bot_conversations_owner_bot_updated_idx
  on public.bot_conversations(owner_id, bot_id, updated_at desc);

create table if not exists public.bot_messages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  conversation_id uuid not null references public.bot_conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null check (char_length(content) between 1 and 16000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists bot_messages_owner_conversation_created_idx
  on public.bot_messages(owner_id, conversation_id, created_at asc);

alter table public.bot_definitions enable row level security;
alter table public.bot_conversations enable row level security;
alter table public.bot_messages enable row level security;
revoke all on public.bot_definitions, public.bot_conversations, public.bot_messages from public, anon, authenticated;
grant select, insert, update, delete on public.bot_definitions, public.bot_conversations, public.bot_messages to service_role;

drop trigger if exists bot_definitions_set_updated_at on public.bot_definitions;
create trigger bot_definitions_set_updated_at before update on public.bot_definitions
  for each row execute function private.set_updated_at();
drop trigger if exists bot_conversations_set_updated_at on public.bot_conversations;
create trigger bot_conversations_set_updated_at before update on public.bot_conversations
  for each row execute function private.set_updated_at();
