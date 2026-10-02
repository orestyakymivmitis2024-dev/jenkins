// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  // Every page is rendered on the Worker at request time (SSR), like arctic-crown.
  output: 'server',
  // Reads wrangler.jsonc; CLOUDFLARE_ENV (develop | branch | release) picks the env block
  // that gets flattened into dist/server/wrangler.json.
  // passthrough = no Cloudflare Images binding (keeps the lab on the free plan, nothing extra to provision).
  adapter: cloudflare({ imageService: 'passthrough' }),
  // Without this the adapter would auto-provision an extra SESSION KV namespace per Worker.
  session: false,
});
