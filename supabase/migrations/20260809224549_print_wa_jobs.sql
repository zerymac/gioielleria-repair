-- Migrazione ADDITIVA — code di stampa e WhatsApp (pattern outbox per Netlify).
-- Vedi docs/MIGRAZIONE-NETLIFY.md. NON tocca tabelle o dati esistenti:
-- solo CREATE TABLE + ALTER PUBLICATION. Sicura da applicare in produzione.

-- ── Coda di stampa ────────────────────────────────────────────────
create table if not exists public.print_jobs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  html        text not null,
  copies      int  not null default 1,
  width       text not null default '62mm',
  height      text not null default '100mm',
  status      text not null default 'pending',   -- pending | printing | done | error
  error       text,
  printed_at  timestamptz,
  origin      text
);
create index if not exists print_jobs_status_idx on public.print_jobs (status, created_at);

-- ── Coda WhatsApp (sostituisce POST /wa/send-bulk) ────────────────
create table if not exists public.wa_jobs (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  telefono    text not null,
  messaggio   text not null,
  status      text not null default 'pending',   -- pending | sending | done | error
  error       text,
  sent_at     timestamptz
);
create index if not exists wa_jobs_status_idx on public.wa_jobs (status, created_at);

-- ── Realtime: il consumer sul Mac si iscrive a queste tabelle ─────
-- (idempotente: ignora l'errore se la tabella è già nella publication)
do $$
begin
  begin
    alter publication supabase_realtime add table public.print_jobs;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.wa_jobs;
  exception when duplicate_object then null;
  end;
end $$;

-- ── RLS (hardening opzionale) ─────────────────────────────────────
-- Di default lasciato commentato per restare coerente con lo stato attuale
-- del progetto (policy permissive). Attivare INSIEME a Supabase Auth:
--
-- alter table public.print_jobs enable row level security;
-- alter table public.wa_jobs    enable row level security;
-- create policy "anon_insert_print" on public.print_jobs for insert to anon with check (true);
-- create policy "anon_insert_wa"    on public.wa_jobs    for insert to anon with check (true);
-- -- SELECT/UPDATE riservati al consumer che gira con service_role (bypassa RLS).
