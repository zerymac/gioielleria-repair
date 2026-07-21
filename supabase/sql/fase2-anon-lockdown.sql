-- ============================================================================
-- Fase 2 — Lockdown del ruolo anon  (IL vero interruttore di C1)
-- Zerrillo Preziosi — Piano sicurezza/migrazione, 04/07/2026
-- ----------------------------------------------------------------------------
-- ⚠️  PREREQUISITI OBBLIGATORI prima di eseguire — altrimenti si rompe tutto:
--   1. wa-bot e backup.js girano con SUPABASE_SERVICE_ROLE_KEY (bypassano RLS).
--   2. L'app usa Supabase Auth: gli operatori sono `authenticated`, non `anon`.
--   3. Le pagine pubbliche (docs/*.html) usano SOLO le RPC della Fase 1.
--
-- Dopo questo script:
--   • anon  → NESSUN accesso diretto alle tabelle; solo EXECUTE sulle 3 RPC.
--   • authenticated → CRUD sulle tabelle operative (operatore loggato = fidato).
--   • La chiave anon pubblica (GitHub Pages) diventa innocua: non legge/scrive
--     l'anagrafica, può solo invocare le 3 funzioni token-based. → C1 CHIUSO.
--
-- Reversibile con fase2-anon-lockdown-rollback.sql (ripristina anon_all).
-- ============================================================================

-- ── 1. Rimuove le policy permissive "anon_all using(true)" ──────────────────
drop policy if exists anon_all on public.customers;
drop policy if exists anon_all on public.repairs;
drop policy if exists anon_all on public.ddts;
drop policy if exists anon_all on public.repairers;
drop policy if exists anon_all on public.orders;
drop policy if exists anon_all on public.quote_tokens;

-- ── 2. Policy operative per gli operatori loggati (authenticated) ───────────
-- Single-tenant: qualunque operatore autenticato è fidato → using(true).
-- (Raffinabile in futuro con controlli per-riga/owner.)
create policy authenticated_all on public.customers    for all to authenticated using (true) with check (true);
create policy authenticated_all on public.repairs      for all to authenticated using (true) with check (true);
create policy authenticated_all on public.ddts         for all to authenticated using (true) with check (true);
create policy authenticated_all on public.repairers    for all to authenticated using (true) with check (true);
create policy authenticated_all on public.orders       for all to authenticated using (true) with check (true);
create policy authenticated_all on public.quote_tokens for all to authenticated using (true) with check (true);

-- ── 3. Revoca i privilegi SQL di anon sulle tabelle ─────────────────────────
-- (In Supabase il ruolo anon ha GRANT di default su tutte le tabelle; la sola
--  RLS non basta se in futuro una policy tornasse permissiva: togliamo anche i
--  privilegi a livello di tabella. Le RPC security-definer restano invocabili.)
revoke all on public.customers    from anon;
revoke all on public.repairs      from anon;
revoke all on public.ddts         from anon;
revoke all on public.repairers    from anon;
revoke all on public.orders       from anon;
revoke all on public.quote_tokens from anon;

-- Nota storage: il bucket 'repair-photos' va rivisto a parte (policy di Storage).
-- Se l'upload foto deve restare solo agli operatori, spostarne la policy da
-- anon a authenticated nel pannello Storage → Policies.

-- Fine Fase 2 lockdown.
