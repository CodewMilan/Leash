import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LithicGiftService } from "./lithic";
const dirs: string[] = [];
afterEach(async () => { await Promise.all(dirs.map(d => rm(d, { recursive: true, force: true }))); dirs.length = 0; });
const providerCard = { token: "11111111-1111-4111-8111-111111111111", last_four: "7835", exp_month: "11", exp_year: "2030", state: "OPEN", spend_limit: 10000, spend_limit_duration: "FOREVER", type: "VIRTUAL", pan: "secret-pan", cvv: "secret-cvv" };
async function setup(request: typeof fetch) {
  const dir = await mkdtemp(join(tmpdir(), "leash-lithic-")); dirs.push(dir);
  return { dir, service: new LithicGiftService({ apiKey: "test-key", directory: dir }, request) };
}
describe("Lithic gift issuance", () => {
  it("creates at sandbox only, persists reservation and never exposes credentials", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(providerCard)));
    const { service, dir } = await setup(request);
    const card = await service.issue();
    expect(card.lastFour).toBe("7835");
    expect(JSON.stringify(card)).not.toMatch(/secret-pan|secret-cvv|test-key/);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe("https://sandbox.lithic.com/v1/cards");
    expect(JSON.parse(init!.body as string)).toMatchObject({ type: "VIRTUAL", spend_limit: 10000, spend_limit_duration: "FOREVER" });
    expect(new Headers(init!.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(await readFile(join(dir, "gift.json"), "utf8")).not.toMatch(/secret-pan|secret-cvv|test-key/);
    await service.issue();
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("recovers an ambiguous provider timeout without sending another create", async () => {
    let memo = "";
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      if (init?.method === "POST") { memo = JSON.parse(init.body as string).memo; throw new Error("timeout"); }
      return new Response(JSON.stringify({ data: [{ ...providerCard, memo }], has_more: false }));
    });
    const { service } = await setup(request);
    await expect(service.issue()).rejects.toThrow(/reserved/);
    expect((await service.get())?.lastFour).toBe("7835");
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("recovers a reservation from a later provider page", async () => {
    let memo = "";
    const request = vi.fn<typeof fetch>().mockImplementation(async (url, init) => {
      if (init?.method === "POST") { memo = JSON.parse(init.body as string).memo; throw new Error("timeout"); }
      const nextPage = String(url).includes("starting_after=");
      return new Response(JSON.stringify({ data: [{ ...providerCard, memo: nextPage ? memo : "another-gift" }], has_more: !nextPage }));
    });
    const { service } = await setup(request);
    await expect(service.issue()).rejects.toThrow(/reserved/);
    expect((await service.get())?.lastFour).toBe("7835");
    expect(request.mock.calls[2][0]).toContain("starting_after=");
  });
  it("does not reissue unresolved reservations or leak provider error bodies", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => new Response(JSON.stringify(init?.method === "POST" ? { message:"test-key secret-pan" } : {data:[],has_more:false}), {status:init?.method === "POST" ? 403 : 200}));
    const { service } = await setup(request);
    await expect(service.issue()).rejects.toThrow(/reserved/);
    await expect(service.issue()).rejects.toThrow(/reserved/);
    expect(request.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });
  it("serializes simultaneous issuance attempts", async () => {
    const request = vi.fn<typeof fetch>().mockImplementation(async () => new Response(JSON.stringify(providerCard)));
    const { service } = await setup(request);
    await Promise.allSettled([service.issue(), service.issue()]);
    expect(request.mock.calls.filter(([, init])=>init?.method === "POST")).toHaveLength(1);
  });
});
