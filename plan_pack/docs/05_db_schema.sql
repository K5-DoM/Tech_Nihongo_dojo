-- 05. DB Schema (Supabase/PostgreSQL)

-- users (auth.users と 1:1 拡張)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  major text,
  research_theme text,
  tech_stack text[],
  target_role text,
  target_company_type text,
  jp_level text,
  ticket_count int not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null default 'standard',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active', -- active | finished | aborted
  -- 面接開始時点のプロフィールを固定（面接中に編集しても当該セッションは変わらない）
  profile_snapshot jsonb
);

create table if not exists public.messages (
  id bigserial primary key,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  correction text,
  created_at timestamptz not null default now()
);

create table if not exists public.evaluations (
  id bigserial primary key,
  interview_id uuid not null unique references public.interviews(id) on delete cascade,
  score_logic int not null check (score_logic between 1 and 5),
  score_accuracy int not null check (score_accuracy between 1 and 5),
  score_clarity int not null check (score_clarity between 1 and 5),
  score_keigo int not null check (score_keigo between 1 and 5),
  score_specificity int not null check (score_specificity between 1 and 5),
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  next_actions text[] not null default '{}',
  summary text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.weakness_history (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  weakness_tag text not null,
  severity int not null default 1 check (severity between 1 and 5),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count int not null default 1
);

create table if not exists public.billing_events (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete set null,
  stripe_event_id text unique not null,
  event_type text not null,
  amount_jpy int,
  tickets_added int default 0,
  raw jsonb not null,
  created_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
alter table public.interviews enable row level security;
alter table public.messages enable row level security;
alter table public.evaluations enable row level security;
alter table public.weakness_history enable row level security;
alter table public.billing_events enable row level security;

-- policies
create policy "profiles_select_own"
on public.profiles for select
using (auth.uid() = id);

create policy "profiles_update_own"
on public.profiles for update
using (auth.uid() = id);

create policy "interviews_rw_own"
on public.interviews for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "messages_rw_own"
on public.messages for all
using (
  exists (
    select 1 from public.interviews i
    where i.id = messages.interview_id and i.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.interviews i
    where i.id = messages.interview_id and i.user_id = auth.uid()
  )
);

create policy "evaluations_rw_own"
on public.evaluations for all
using (
  exists (
    select 1 from public.interviews i
    where i.id = evaluations.interview_id and i.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.interviews i
    where i.id = evaluations.interview_id and i.user_id = auth.uid()
  )
);

create policy "weakness_rw_own"
on public.weakness_history for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "billing_select_own"
on public.billing_events for select
using (auth.uid() = user_id);

-- updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated
before update on public.profiles
for each row execute function public.set_updated_at();
