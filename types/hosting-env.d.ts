/** Optional project bindings augment the official generated Workers runtime. */
declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
  }
}
