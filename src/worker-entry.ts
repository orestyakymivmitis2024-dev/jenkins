// Worker entry point (the "main" in wrangler.jsonc).
// - fetch:     Astro's SSR handler from the adapter (renders pages on every request)
// - scheduled: our cron — writes a "heartbeat" into KV, standing in for the real cache warming.
import { handle } from '@astrojs/cloudflare/handler';

export default {
  fetch: handle,

  async scheduled(controller, env, ctx) {
    const heartbeat = {
      writtenAt: new Date(controller.scheduledTime).toISOString(),
      writer: env.TIER,
    };
    ctx.waitUntil(env.KV_CACHE.put('heartbeat', JSON.stringify(heartbeat)));
  },
} satisfies ExportedHandler<Env>;
