/**
 * AUDIT — Finto client Supabase in memoria.
 * Replica l'API query-builder usata da src/App.js e print-server/wa-bot.js.
 * Nessuna connessione di rete: tutte le tabelle vivono in `db` (oggetto JS).
 */

const db = {
  customers: [], repairs: [], ddts: [], repairers: [], orders: [], quote_tokens: [],
};

let _ts = Date.now();
const nextTs = () => new Date(++_ts).toISOString();
const clone = (x) => JSON.parse(JSON.stringify(x));

/* Realtime finto: handler registrati da .channel().on() */
const realtimeHandlers = []; // {table, cb}
let autoEmit = true;
let failSelects = false;
let failWrites = false;

function emitTable(table, payload = {}) {
  realtimeHandlers
    .filter((h) => h.table === table || h.table === "*")
    .forEach((h) => { try { h.cb({ eventType: "UPDATE", new: payload.new || {}, old: {}, ...payload }); } catch (_) {} });
}

class Query {
  constructor(table) {
    this.table = table;
    this._filters = [];
    this._order = null; this._range = null; this._limit = null;
    this._op = "select"; this._payload = null;
    this._single = false; this._maybe = false;
  }
  select() { return this; }
  eq(col, val)  { this._filters.push((r) => r[col] === val); return this; }
  neq(col, val) { this._filters.push((r) => r[col] !== val); return this; }
  is(col, val)  { this._filters.push((r) => (val === null ? r[col] == null : r[col] === val)); return this; }
  not(col, op, val) {
    if (op === "is") this._filters.push((r) => !(val === null ? r[col] == null : r[col] === val));
    return this;
  }
  contains(col, arr) {
    this._filters.push((r) => Array.isArray(r[col]) && arr.every((v) => r[col].includes(v)));
    return this;
  }
  order(col, opts = {}) { this._order = { col, asc: opts.ascending !== false }; return this; }
  range(a, b) { this._range = [a, b]; return this; }
  limit(n) { this._limit = n; return this; }
  single() { this._single = true; return this; }
  maybeSingle() { this._maybe = true; return this; }
  upsert(p) { this._op = "upsert"; this._payload = p; return this; }
  insert(p) { this._op = "insert"; this._payload = p; return this; }
  update(p) { this._op = "update"; this._payload = p; return this; }
  delete()  { this._op = "delete"; return this; }

  then(res, rej) { return Promise.resolve().then(() => this._exec()).then(res, rej); }

  _exec() {
    const rows = db[this.table] || (db[this.table] = []);
    if (this._op === "select") {
      if (failSelects) return { data: null, error: { message: "connessione fallita (audit)", code: "AUDIT_DOWN" } };
      let out = rows.filter((r) => this._filters.every((f) => f(r)));
      if (this._order) {
        const { col, asc } = this._order;
        out = [...out].sort((a, b) => String(a[col] ?? "").localeCompare(String(b[col] ?? "")) * (asc ? 1 : -1));
      }
      if (this._range) out = out.slice(this._range[0], this._range[1] + 1);
      if (this._limit != null) out = out.slice(0, this._limit);
      out = clone(out);
      if (this._single) return { data: out[0] || null, error: out[0] ? null : { message: "no rows", code: "PGRST116" } };
      if (this._maybe)  return { data: out[0] || null, error: null };
      return { data: out, error: null };
    }
    if (this._op !== "select" && failWrites) {
      return { data: null, error: { message: "scrittura fallita (audit)", code: "AUDIT_WRITE" } };
    }
    if (this._op === "upsert") {
      const items = Array.isArray(this._payload) ? this._payload : [this._payload];
      for (const it of items) {
        const i = rows.findIndex((r) => r.id === it.id);
        if (i >= 0) rows[i] = { ...rows[i], ...clone(it) };
        else rows.push({ ...clone(it), created_at: nextTs() });
      }
      if (autoEmit) emitTable(this.table, { new: items[items.length - 1] });
      return { data: null, error: null };
    }
    if (this._op === "insert") {
      const items = Array.isArray(this._payload) ? this._payload : [this._payload];
      for (const it of items) rows.push({ ...clone(it), created_at: nextTs() });
      if (autoEmit) emitTable(this.table, { new: items[items.length - 1] });
      return { data: null, error: null };
    }
    if (this._op === "update") {
      let n = 0;
      for (const r of rows) {
        if (this._filters.every((f) => f(r))) { Object.assign(r, clone(this._payload)); n++; }
      }
      if (autoEmit && n) emitTable(this.table, { new: clone(this._payload) });
      return { data: null, error: null };
    }
    if (this._op === "delete") {
      const keep = rows.filter((r) => !this._filters.every((f) => f(r)));
      const n = rows.length - keep.length;
      db[this.table] = keep;
      if (autoEmit && n) emitTable(this.table, {});
      return { data: null, error: null };
    }
    return { data: null, error: { message: "op non supportata: " + this._op } };
  }
}

const channels = [];
const supabase = {
  from: (table) => new Query(table),
  channel: (name) => {
    const ch = {
      name,
      on(_evt, opts, cb) { realtimeHandlers.push({ table: (opts && opts.table) || "*", cb }); return ch; },
      subscribe(cb) { if (cb) cb("SUBSCRIBED"); return ch; },
    };
    channels.push(ch);
    return ch;
  },
  removeChannel: () => {},
  storage: {
    from: (bucket) => ({
      upload: async () => ({ error: null }),
      getPublicUrl: (path) => ({ data: { publicUrl: `https://fake.storage.local/${bucket}/${path}` } }),
    }),
  },
};

const __fake = {
  db,
  reset() {
    for (const k of Object.keys(db)) db[k] = [];
    realtimeHandlers.length = 0;
    channels.length = 0;
    autoEmit = true; failSelects = false; failWrites = false;
  },
  seed(table, rowsArr) {
    for (const r of rowsArr) (db[table] || (db[table] = [])).push({ created_at: nextTs(), ...clone(r) });
  },
  emitTable,
  setAutoEmit(v) { autoEmit = v; },
  setFailSelects(v) { failSelects = v; },
  setFailWrites(v) { failWrites = v; },
  realtimeHandlers,
};

module.exports = { supabase, __fake, createClient: () => supabase };
