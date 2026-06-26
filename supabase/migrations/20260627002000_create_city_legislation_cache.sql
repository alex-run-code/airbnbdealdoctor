create table if not exists public.city_legislation_cache (
  commune_code text primary key,
  payload jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists city_legislation_cache_expires_at_idx
  on public.city_legislation_cache (expires_at);

create or replace function public.set_city_legislation_cache_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists city_legislation_cache_set_updated_at on public.city_legislation_cache;

create trigger city_legislation_cache_set_updated_at
before update on public.city_legislation_cache
for each row
execute function public.set_city_legislation_cache_updated_at();

alter table public.city_legislation_cache enable row level security;

revoke all on public.city_legislation_cache from anon, authenticated;
