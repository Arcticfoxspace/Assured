-- ASSURED Part 3 — run once in Supabase → SQL Editor.
-- One generic table; the server (service-role key) is the only client.
create table if not exists public.assured_rows (
  col  text   not null,            -- 'journeys' | 'reports'
  id   text   not null,
  k    text,                       -- lookup key (hashed guardian token)
  exp  bigint not null,            -- expiry, epoch ms — rows past this are ignored and purged
  data jsonb  not null,
  primary key (col, id)
);
create index if not exists assured_rows_k   on public.assured_rows (col, k);
create index if not exists assured_rows_exp on public.assured_rows (col, exp);

-- Row Level Security ON with NO policies = the public/anon key can read and
-- write nothing. Only the server's service-role key can touch this table.
alter table public.assured_rows enable row level security;

-- ---------------------------------------------------------------------------
-- Part C — shared abuse counters for Mewvi's model calls (optional; free tier).
-- Run this block once in Supabase → SQL Editor. Safe to re-run.
-- Without it the app keeps using its per-instance in-memory limits.
-- Stores only: a counter name (a hashed client id or "mewvi-day"), a count, an
-- expiry. No messages, no IPs, no locations.
-- ---------------------------------------------------------------------------
create table if not exists public.assured_counters (
  k   text    primary key,           -- "<name>:<window bucket>"
  n   integer not null default 0,
  exp bigint  not null               -- epoch ms; expired rows are purged opportunistically
);
alter table public.assured_counters enable row level security;  -- no policies: anon key sees nothing

create or replace function public.assured_counter_hit(p_key text, p_limit integer, p_exp bigint)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v integer;
begin
  if length(p_key) > 200 then raise exception 'key too long'; end if;
  insert into public.assured_counters as c (k, n, exp) values (p_key, 1, p_exp)
  on conflict (k) do update set n = c.n + 1
  returning c.n into v;
  if random() < 0.02 then
    delete from public.assured_counters where exp < (extract(epoch from now()) * 1000)::bigint;
  end if;
  return v <= p_limit;   -- atomic: true = allowed, false = over the limit
end
$$;
revoke all on function public.assured_counter_hit(text, integer, bigint) from public, anon, authenticated;
grant execute on function public.assured_counter_hit(text, integer, bigint) to service_role;
