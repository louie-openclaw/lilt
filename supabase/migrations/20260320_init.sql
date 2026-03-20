create extension if not exists pgcrypto;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.decks (id) on delete cascade,
  kind text not null check (kind in ('deck', 'folder')),
  title text not null,
  description text not null default '',
  color text not null default '#f29cb6',
  position integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  front_html text not null,
  back_html text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.review_states (
  card_id uuid primary key references public.cards (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  state text not null default 'new' check (state in ('new', 'learning', 'review')),
  due_at timestamptz not null default timezone('utc', now()),
  interval_days integer not null default 0,
  ease_factor numeric(4,2) not null default 2.50,
  repetitions integer not null default 0,
  lapses integer not null default 0,
  last_reviewed_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.study_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  card_id uuid not null references public.cards (id) on delete cascade,
  deck_id uuid not null references public.decks (id) on delete cascade,
  rating text not null check (rating in ('again', 'hard', 'good', 'easy')),
  previous_state text not null check (previous_state in ('new', 'learning', 'review')),
  studied_at timestamptz not null default timezone('utc', now()),
  next_due_at timestamptz not null
);

create index if not exists decks_user_parent_idx on public.decks (user_id, parent_id, position);
create index if not exists cards_user_deck_idx on public.cards (user_id, deck_id);
create index if not exists review_states_user_due_idx on public.review_states (user_id, due_at);
create index if not exists study_events_user_studied_idx on public.study_events (user_id, studied_at desc);

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists profiles_handle_updated_at on public.profiles;
create trigger profiles_handle_updated_at
before update on public.profiles
for each row
execute procedure public.handle_updated_at();

drop trigger if exists decks_handle_updated_at on public.decks;
create trigger decks_handle_updated_at
before update on public.decks
for each row
execute procedure public.handle_updated_at();

drop trigger if exists cards_handle_updated_at on public.cards;
create trigger cards_handle_updated_at
before update on public.cards
for each row
execute procedure public.handle_updated_at();

drop trigger if exists review_states_handle_updated_at on public.review_states;
create trigger review_states_handle_updated_at
before update on public.review_states
for each row
execute procedure public.handle_updated_at();

alter table public.profiles enable row level security;
alter table public.decks enable row level security;
alter table public.cards enable row level security;
alter table public.review_states enable row level security;
alter table public.study_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = user_id);

drop policy if exists "decks_select_own" on public.decks;
create policy "decks_select_own" on public.decks
for select using (auth.uid() = user_id);

drop policy if exists "decks_insert_own" on public.decks;
create policy "decks_insert_own" on public.decks
for insert with check (auth.uid() = user_id);

drop policy if exists "decks_update_own" on public.decks;
create policy "decks_update_own" on public.decks
for update using (auth.uid() = user_id);

drop policy if exists "decks_delete_own" on public.decks;
create policy "decks_delete_own" on public.decks
for delete using (auth.uid() = user_id);

drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards
for select using (auth.uid() = user_id);

drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards
for insert with check (auth.uid() = user_id);

drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards
for update using (auth.uid() = user_id);

drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own" on public.cards
for delete using (auth.uid() = user_id);

drop policy if exists "review_states_select_own" on public.review_states;
create policy "review_states_select_own" on public.review_states
for select using (auth.uid() = user_id);

drop policy if exists "review_states_insert_own" on public.review_states;
create policy "review_states_insert_own" on public.review_states
for insert with check (auth.uid() = user_id);

drop policy if exists "review_states_update_own" on public.review_states;
create policy "review_states_update_own" on public.review_states
for update using (auth.uid() = user_id);

drop policy if exists "review_states_delete_own" on public.review_states;
create policy "review_states_delete_own" on public.review_states
for delete using (auth.uid() = user_id);

drop policy if exists "study_events_select_own" on public.study_events;
create policy "study_events_select_own" on public.study_events
for select using (auth.uid() = user_id);

drop policy if exists "study_events_insert_own" on public.study_events;
create policy "study_events_insert_own" on public.study_events
for insert with check (auth.uid() = user_id);

drop policy if exists "study_events_delete_own" on public.study_events;
create policy "study_events_delete_own" on public.study_events
for delete using (auth.uid() = user_id);

create or replace function public.create_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.create_profile_for_user();
