// =============================================================================
// Loads the site's browser scripts into a sandbox, with a fake Supabase client (no network).
// =============================================================================
const fs = require("fs"), vm = require("vm"), path = require("path");
const SITE = process.env.SITE || path.join(__dirname, "../..");
module.exports = function load(files, extra = {}) {
  const store = {};
  const chain = () => new Proxy(async () => ({ data: [], error: null }), { get: (t, k) => (k === "then" ? (r) => r({ data: [], error: null }) : chain()) });
  const window = {
    CP_CONFIG: { supabaseUrl: "https://example.supabase.co", supabaseKey: "test" },
    supabase: { createClient: () => ({ rpc: async () => ({ data: null, error: null }), from: () => chain(), channel: () => chain(), storage: { from: () => chain() },
      auth: { getSession: async () => ({ data: {} }), onAuthStateChange: () => ({}) } }) },
    localStorage: { getItem: (k) => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: (k) => delete store[k] },
    location: { href: "https://x/", search: "", pathname: "/" }, addEventListener() {}, setTimeout, clearTimeout, setInterval, clearInterval, console,
    document: { documentElement: {}, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] }, ...extra
  };
  window.window = window; window.localStorage = window.localStorage;
  const ctx = vm.createContext(window);
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(SITE, f), "utf8"), ctx, { filename: f });
  ctx.get = (name) => vm.runInContext(name, ctx);
  return ctx;
};
