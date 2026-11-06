import { serve, type HttpBindings } from "@hono/node-server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { config, DEVICE_ROOT } from "./config.js";
import { hashscanTopic } from "./hedera/client.js";
import { state, type EpisodeRecord, type ScreenState } from "./state.js";

export interface ServerHandlers {
  ask(input: { text: string; qr?: string | null }): void;
  cancel(): void;
  busy(): boolean;
}

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function startServer(handlers: ServerHandlers) {
  const app = new Hono<{ Bindings: HttpBindings }>();

  app.use("/api/*", cors({ origin: "*", allowMethods: ["GET"] }));

  app.get("/", (c) => c.redirect("/screen"));

  app.get("/screen", async (c) => c.html(await readFile(path.join(DEVICE_ROOT, "screen", "index.html"), "utf8")));

  app.get("/api/state", (c) =>
    c.json({
      screen: state.screen,
      episodes: state.history(),
      device: {
        hederaAccountId: config.hedera.accountId,
        network: config.hedera.network,
        usdcTokenId: config.hedera.usdcTokenId,
        spendLimitUsdc: config.spendLimitUsdc,
        spendLogTopicId: config.hedera.spendLogTopicId,
        spendLogUrl: config.hedera.spendLogTopicId ? hashscanTopic(config.hedera.spendLogTopicId) : null,
      },
    }),
  );

  app.get("/api/events", (c) =>
    streamSSE(c, async (stream) => {
      const onScreen = (s: ScreenState) => stream.writeSSE({ event: "screen", data: JSON.stringify(s) });
      const onEpisode = (e: EpisodeRecord) => stream.writeSSE({ event: "episode", data: JSON.stringify(e) });
      state.on("screen", onScreen);
      state.on("episode", onEpisode);
      await onScreen(state.screen);
      const keepAlive = setInterval(() => stream.writeSSE({ event: "ping", data: "" }), 15_000);
      await new Promise<void>((resolve) => stream.onAbort(resolve));
      clearInterval(keepAlive);
      state.off("screen", onScreen);
      state.off("episode", onEpisode);
    }),
  );

  // Typed input for bench testing without the mic. Loopback only: nothing off the device can start a payment.
  app.post("/local/ask", async (c) => {
    if (!LOOPBACK.has(c.env.incoming.socket.remoteAddress ?? "")) return c.json({ error: "local only" }, 403);
    if (handlers.busy()) return c.json({ error: "busy" }, 409);
    const body = (await c.req.json().catch(() => null)) as { text?: string; qr?: string } | null;
    if (!body?.text?.trim()) return c.json({ error: "text is required" }, 400);
    handlers.ask({ text: body.text.trim(), qr: body.qr ?? null });
    return c.json({ ok: true });
  });

  app.post("/local/cancel", (c) => {
    if (!LOOPBACK.has(c.env.incoming.socket.remoteAddress ?? "")) return c.json({ error: "local only" }, 403);
    handlers.cancel();
    return c.json({ ok: true });
  });

  serve({ fetch: app.fetch, port: config.server.port, hostname: "0.0.0.0" }, (info) => {
    console.log(`[server] screen at http://localhost:${info.port}/screen, read-only feed at /api/state and /api/events`);
  });
}
