-- ============================================================================
-- Fase 2 (versione "app online", 05/09/2026) — Lockdown del ruolo anon
-- Zerrillo Preziosi — sostituisce fase2-anon-lockdown.sql, che dropava una
-- policy `anon_all` MAI esistita nel DB live. Le policy permissive reali si
-- chiamano "accesso completo" (customers/repairs/ddts/repairers), "Allow all"
-- (orders), "public access" (quote_tokens) e sono `TO public USING(true)`.
-- ----------------------------------------------------------------------------
-- ⚠️  PREREQUISITI — altrimenti si rompe l'app:
--   1. L'app riparazioni deployata con login Supabase (branch feature/online):
--      gli operatori sono `authenticated`, non più `anon`.
--   2. wa-bot, print server e backup.js girano con SUPABASE_SECRET_KEY
--      (bypassano RLS) — già vero dal 2026-07.
--   3. Le pagine pubbliche docs/*.html usano SOLO le RPC della Fase 1 — già vero.
--
-- Dopo questo script:
--   • anon → NESSUN accesso diretto alle tabelle; solo EXECUTE sulle 3 RPC
--     (get_repair_status, get_quote, respond_quote) — invariate.
--   • authenticated → CRUD su customers/repairs/ddts/repairers/orders/quote_tokens
--     e upload foto sul bucket repair-photos.
--   • La chiave publishable nel bundle/GitHub Pages diventa innocua.
-- Reversibile con fase2-lockdown-online-rollback.sql.
-- ============================================================================

-- ── 1. Rimuove le policy permissive TO public ───────────────────────────────
drop policy if exists "accesso completo" on public.customers;
drop policy if exists "accesso completo" on public.repairs;
drop policy if exists "accesso completo" on public.ddts;
drop policy if exists "accesso completo" on public.repairers;
drop policy if exists "Allow all"        on public.orders;
drop policy if exists "public access"    on public.quote_tokens;
-- (per sicurezza anche i nomi previsti dal vecchio script)
drop policy if exists anon_all on public.customers;
drop policy if exists anon_all on public.repairs;
drop policy if exists anon_all on public.ddts;
drop policy if exists anon_all on public.repairers;
drop policy if exists anon_all on public.orders;
drop policy if exists anon_all on public.quote_tokens;

-- ── 2. Policy operative per gli operatori loggati ───────────────────────────
-- Single-tenant: qualunque operatore autenticato è fidato → using(true).
drop policy if exists authenticated_all on public.customers;
drop policy if exists authenticated_all on public.repairs;
drop policy if exists authenticated_all on public.ddts;
drop policy if exists authenticated_all on public.repairers;
drop policy if exists authenticated_all on public.orders;
drop policy if exists authenticated_all on public.quote_tokens;
create policy authenticated_all on public.customers    for all to authenticated using (true) with check (true);
create policy authenticated_all on public.repairs      for all to authenticated using (true) with check (true);
create policy authenticated_all on public.ddts         for all to authenticated using (true) with check (true);
create policy authenticated_all on public.repairers    for all to authenticated using (true) with check (true);
create policy authenticated_all on public.orders       for all to authenticated using (true) with check (true);
create policy authenticated_all on public.quote_tokens for all to authenticated using (true) with check (true);

-- ── 3. Revoca i privilegi SQL di anon sulle tabelle ─────────────────────────
-- (la sola RLS non basta se in futuro una policy tornasse permissiva)
revoke all on public.customers    from anon;
revoke all on public.repairs      from anon;
revoke all on public.ddts         from anon;
revoke all on public.repairers    from anon;
revoke all on public.orders       from anon;
revoke all on public.quote_tokens from anon;
grant select, insert, update, delete on public.customers, public.repairs, public.ddts,
  public.repairers, public.orders, public.quote_tokens to authenticated;

-- ── 4. Storage: foto riparazioni solo da operatori loggati ──────────────────
-- Bucket repair-photos è pubblico in LETTURA (le URL delle foto restano
-- valide); la SCRITTURA passa da anon ad authenticated.
drop policy if exists "Allow anon insert" on storage.objects;
drop policy if exists "Allow anon update" on storage.objects;
drop policy if exists repair_photos_insert on storage.objects;
drop policy if exists repair_photos_update on storage.objects;
create policy repair_photos_insert on storage.objects for insert to authenticated with check (bucket_id = 'repair-photos');
create policy repair_photos_update on storage.objects for update to authenticated using (bucket_id = 'repair-photos');

-- Fine Fase 2 lockdown (app online).
