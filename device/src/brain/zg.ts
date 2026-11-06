import { config } from "../config.js";
import type { Contact } from "../contacts.js";
import { BrainOfflineError, parseRouterResponse, systemPrompt, userMessage, type Decision, type ZgReceipt } from "../core/decision.js";

export { BrainOfflineError, type Decision, type ZgReceipt } from "../core/decision.js";

async function call0G(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(`${config.zg.baseUrl}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${config.zg.apiKey}`, "content-type": "application/json", ...init.headers },
      signal: AbortSignal.timeout(config.zg.timeoutMs),
    });
  } catch (err) {
    throw new BrainOfflineError(`0G unreachable: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Boot check with a 1-token completion: a rejected key is a config error and stops the app, unlike an outage. */
export async function verifyBrainAccess(): Promise<{ ok: boolean; detail: string }> {
  try {
    const res = await call0G("/chat/completions", {
      method: "POST",
      headers: { "X-0G-Provider-Trust-Mode": "private" },
      body: JSON.stringify({ model: config.zg.model, max_tokens: 1, messages: [{ role: "user", content: "ping" }] }),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error(`0G rejected ZG_API_KEY (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    if (res.status === 404 || res.status === 400) {
      throw new Error(`0G rejected model "${config.zg.model}" (HTTP ${res.status}): ${(await res.text()).slice(0, 200)}`);
    }
    if (res.ok) return { ok: true, detail: "ok" };
    return { ok: false, detail: `HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}` };
  } catch (err) {
    if (err instanceof BrainOfflineError) return { ok: false, detail: err.message };
    throw err;
  }
}

export async function pingBrain(): Promise<boolean> {
  try {
    const res = await call0G("/models", { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

export async function decide(input: { heard: string; saw: string | null; contacts: Contact[] }): Promise<{ decision: Decision } & ZgReceipt> {
  const res = await call0G("/chat/completions", {
    method: "POST",
    // Private trust mode: the Router only uses TEE-attested providers and fails instead of falling back.
    headers: { "X-0G-Provider-Trust-Mode": "private" },
    body: JSON.stringify({
      model: config.zg.model,
      temperature: 0,
      stream: false,
      verify_tee: true,
      messages: [
        { role: "system", content: systemPrompt(input.contacts, config.spendLimitUsdc) },
        { role: "user", content: userMessage(input.heard, input.saw) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    throw new BrainOfflineError(`0G connection dropped: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseRouterResponse({ status: res.status, headers: res.headers, text }, config.zg.model);
}
