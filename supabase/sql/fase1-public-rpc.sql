-- ============================================================================
-- Fase 1 — RPC pubbliche token-based (security definer)
-- Zerrillo Preziosi — Piano sicurezza/migrazione, 04/07/2026
-- ----------------------------------------------------------------------------
-- Scopo: dare alle DUE pagine pubbliche (repair-status, approve-quote) un
-- accesso ai dati che espone SOLO le colonne necessarie e che è idempotente,
-- SENZA passare per l'accesso diretto alle tabelle con la chiave anon.
--
-- Queste funzioni sono ADDITIVE: applicarle non cambia il comportamento
-- dell'app né delle policy esistenti. Diventano l'unico canale delle pagine
-- pubbliche solo dopo aver riscritto docs/*.html (step successivo).
--
-- security definer  → la funzione gira come il suo OWNER (che bypassa la RLS),
--                     quindi legge/scrive le tabelle anche quando in Fase 2
--                     ad anon verrà tolto l'accesso diretto.
-- set search_path    → blindato, previene hijack via search_path.
--
-- Conserva ENTRAMBI i meccanismi token del piano:
--   • link_token (colonna su repairs)  → get_repair_status  (QR stato, permanente)
--   • quote_tokens (tabella)           → get_quote / respond_quote (preventivo)
-- ============================================================================

-- ── 1. Stato riparazione via link_token (pagina repair-status) ──────────────
-- Ritorna la riga (max 1) con le SOLE colonne mostrate al cliente, più il
-- token del preventivo pendente se ne esiste uno (per offrire accetta/rifiuta).
create or replace function public.get_repair_status(p_link_token text)
returns table (
  numero                          text,
  categoria                       text,
  tipo_lavoro                     text,
  descrizione                     text,
  problema                        text,
  status                          text,
  preventivo                      numeric,
  nota_preventivo                 text,
  richiesta_preventivo_fornitore  boolean,
  preventivo_accettato            boolean,
  preventivo_rifiutato            boolean,
  data_consegna                   date,
  quote_token                     text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    r.numero, r.categoria, r.tipo_lavoro, r.descrizione, r.problema,
    r.status, r.preventivo, r.nota_preventivo, r.richiesta_preventivo_fornitore,
    r.preventivo_accettato, r.preventivo_rifiutato, r.data_consegna,
    (select qt.token
       from public.quote_tokens qt
      where qt.repair_id = r.id
        and qt.accepted_at is null
        and qt.declined_at is null
      order by qt.created_at desc
      limit 1) as quote_token
  from public.repairs r
  where r.link_token = p_link_token
    and r.eliminata = false
    and p_link_token is not null
    and p_link_token <> ''
  limit 1;
$$;

-- ── 2. Dettaglio preventivo via quote token (pagina approve-quote) ──────────
-- Ritorna le SOLE colonne mostrate nella pagina di conferma + lo stato del
-- token (accepted_at/declined_at) per mostrare "già confermato/disdetto".
create or replace function public.get_quote(p_token text)
returns table (
  numero       text,
  descrizione  text,
  problema     text,
  preventivo   numeric,
  accepted_at  timestamptz,
  declined_at  timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select r.numero, r.descrizione, r.problema, r.preventivo,
         qt.accepted_at, qt.declined_at
  from public.quote_tokens qt
  join public.repairs r on r.id = qt.repair_id
  where qt.token = p_token
    and p_token is not null
    and p_token <> ''
  limit 1;
$$;

-- ── 3. Risposta al preventivo (accetta/rifiuta), IDEMPOTENTE ────────────────
-- Chiude M10 (doppia submit): FOR UPDATE serializza le richieste concorrenti;
-- la seconda vede accepted_at/declined_at già valorizzato e non ri-scrive.
-- Rispecchia lo stato su repairs → il wa-bot (Realtime) invia il WhatsApp.
-- Ritorno: 'accepted' | 'declined' | 'already_accepted' | 'already_declined' | 'invalid'
create or replace function public.respond_quote(p_token text, p_decision text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_repair_id text;
  v_accepted  timestamptz;
  v_declined  timestamptz;
begin
  if p_decision not in ('accept', 'decline') then
    return 'invalid';
  end if;

  select repair_id, accepted_at, declined_at
    into v_repair_id, v_accepted, v_declined
  from public.quote_tokens
  where token = p_token
  for update;

  if not found then
    return 'invalid';
  end if;

  if v_accepted is not null then return 'already_accepted'; end if;
  if v_declined is not null then return 'already_declined'; end if;

  if p_decision = 'accept' then
    update public.quote_tokens set accepted_at = now() where token = p_token;
    update public.repairs set preventivo_accettato = true where id = v_repair_id;
    return 'accepted';
  else
    update public.quote_tokens set declined_at = now() where token = p_token;
    update public.repairs set preventivo_rifiutato = true where id = v_repair_id;
    return 'declined';
  end if;
end;
$$;

-- ── Grants: solo EXECUTE, a anon (pagine pubbliche) e authenticated (Fase 2) ─
revoke all on function public.get_repair_status(text) from public;
revoke all on function public.get_quote(text)          from public;
revoke all on function public.respond_quote(text, text) from public;

grant execute on function public.get_repair_status(text)  to anon, authenticated;
grant execute on function public.get_quote(text)           to anon, authenticated;
grant execute on function public.respond_quote(text, text) to anon, authenticated;

-- Fine Fase 1 RPC.
