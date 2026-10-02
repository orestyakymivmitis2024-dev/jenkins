/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

// Bindings declared in wrangler.jsonc
interface Env {
  KV_CACHE: KVNamespace;
  ASSETS: Fetcher;
  TIER: string;
}

// Build-time values passed by the pipeline (PUBLIC_* are baked into the build by Vite)
interface ImportMetaEnv {
  readonly PUBLIC_BUILD_BRANCH?: string;
  readonly PUBLIC_BUILD_TIME?: string;
  readonly PUBLIC_DEPLOY_TIER?: string;
}
