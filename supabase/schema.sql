-- Run this once in the Supabase SQL Editor (Project > SQL Editor > New query).

create table if not exists app_state (
  id integer primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keeps updated_at current on every write (used to detect stale local state, if ever needed).
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_state_set_updated_at on app_state;
create trigger app_state_set_updated_at
before update on app_state
for each row execute function set_updated_at();

-- Fully open access (no login): anyone with the anon key can read/write.
-- This matches the previous Claude Artifact behaviour (shared storage, no auth).
alter table app_state enable row level security;

drop policy if exists "app_state_select_anon" on app_state;
create policy "app_state_select_anon" on app_state
  for select using (true);

drop policy if exists "app_state_insert_anon" on app_state;
create policy "app_state_insert_anon" on app_state
  for insert with check (true);

drop policy if exists "app_state_update_anon" on app_state;
create policy "app_state_update_anon" on app_state
  for update using (true) with check (true);

-- Enables realtime change notifications (used so every open tab updates live).
alter publication supabase_realtime add table app_state;

-- Seed row: replace the '{}'::jsonb below with your actual backup JSON
-- (see seed.sql, generated from your exported file, for the real insert).
insert into app_state (id, data)
values (1, '{"players": [], "games": [], "config": {"weights": {"win": 3, "draw": 1, "loss": 2, "goal": 0.5, "assist": 0.3, "mvp": 2}, "confidenceGames": 5}}'::jsonb)
on conflict (id) do nothing;
