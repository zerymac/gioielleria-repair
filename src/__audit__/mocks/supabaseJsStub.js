/* AUDIT — stub @supabase/supabase-js: createClient restituisce il finto client in memoria. */
const { supabase } = require("./fakeSupabase");
module.exports = { createClient: () => supabase };
