import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { BrainOfflineError, decide } from "./brain/zg.js";
import { config } from "./config.js";
import { findContact, loadContacts } from "./contacts.js";
import { fillEndpoint, Refused } from "./core/contacts.js";
import { checkPayment, fromBaseUnits } from "./core/policy.js";
import { hashscanTx } from "./hedera/client.js";
import { appendSpendLog } from "./hedera/spendLog.js";
import { gpio } from "./hw/gpio.js";
import { say } from "./hw/media.js";
import { saveMemory } from "./memory/zgStorage.js";
import { approveWithFingerprint } from "./approve/thumb.js";
import { requestWorldApproval } from "./approve/world.js";
import { PaymentRejected, payX402 } from "./pay/x402.js";
import { state, type EpisodeRecord, type Light, type Phase, type ScreenState } from "./state.js";

const LIGHT: Partial<Record<Phase, Light>> = {
  thinking: "blue",
  saving_memory: "blue",
  requesting: "blue",
  awaiting_thumb: "amber",
  awaiting_world: "purple",
  paying: "blue",
  logging: "blue",
  paid: "green",
  refused: "red",
  safe_mode: "red",
  error: "red",
};

function show(screen: Partial<ScreenState> & Pick<ScreenState, "phase" | "headline">) {
  const light = LIGHT[screen.phase] ?? "off";
  gpio.light(light);
  state.setScreen({ light, ...screen });
}

export class Agent {
  private controller: AbortController | null = null;

  busy() {
    return this.controller !== null;
  }

  cancel() {
    this.controller?.abort();
  }

  async run(input: { heard: string; saw: string | null }): Promise<EpisodeRecord> {
    if (this.controller) throw new Error("An episode is already running");
    const controller = new AbortController();
    this.controller = controller;
    const episode: EpisodeRecord = {
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      heard: input.heard,
      saw: input.saw ?? undefined,
    };
    try {
      await this.episode(episode, controller.signal);
    } catch (err) {
      if (err instanceof BrainOfflineError) {
        state.setBrainOnline(false);
        episode.outcome = "safe_mode";
        episode.reason = err.message;
        show({ phase: "safe_mode", headline: "Brain offline", detail: "0G is unreachable, so I won't pay for anything.", episodeId: episode.id });
        say("My brain is offline, so I won't pay for anything right now.");
      } else if (err instanceof Refused || err instanceof PaymentRejected || controller.signal.aborted) {
        episode.outcome = "refused";
        episode.reason = controller.signal.aborted ? "Cancelled on the device" : err instanceof Error ? err.message : String(err);
        show({ phase: "refused", headline: "Payment refused", detail: episode.reason, episodeId: episode.id });
        gpio.buzz(120);
        say(`Payment refused. ${episode.reason}`);
      } else {
        episode.outcome = "error";
        episode.reason = err instanceof Error ? err.message : String(err);
        console.error(`[agent] episode ${episode.id} failed`, err);
        show({ phase: "error", headline: "Something failed", detail: episode.reason, episodeId: episode.id });
        say("Something went wrong. Nothing was paid.");
      }
    } finally {
      this.controller = null;
      episode.finishedAt = new Date().toISOString();
      await state.recordEpisode(episode).catch((err) => console.error("[agent] could not record episode", err));
    }
    return episode;
  }

  private async episode(episode: EpisodeRecord, signal: AbortSignal) {
    const contacts = await loadContacts();

    // 1. 0G decides. No answer from 0G means no payment, ever.
    show({ phase: "thinking", headline: "Thinking", detail: `"${episode.heard}"`, episodeId: episode.id });
    const { decision, ...receipt } = await decide({ heard: episode.heard!, saw: episode.saw ?? null, contacts });
    const requestId = receipt.requestId;
    state.setBrainOnline(true);
    episode.decision = decision;
    episode.zg = receipt;

    // 2. The device signs and saves the decision to 0G Storage as memory.
    show({ phase: "saving_memory", headline: "Saving memory to 0G", detail: `request ${requestId}`, episodeId: episode.id });
    episode.memory = await saveMemory({
      kind: "leash.episode",
      episodeId: episode.id,
      at: new Date().toISOString(),
      device: config.hedera.accountId,
      heard: episode.heard,
      saw: episode.saw ?? null,
      decision,
      zg: episode.zg,
    });

    if (decision.action !== "pay") {
      episode.outcome = decision.action === "refuse" ? "refused" : "answered";
      episode.reason = decision.reason;
      show({ phase: decision.action === "refuse" ? "refused" : "answered", headline: decision.reply, detail: decision.reason, episodeId: episode.id });
      say(decision.reply);
      return;
    }

    const contact = decision.contactId ? await findContact(decision.contactId) : undefined;
    if (!contact) throw new Refused(`I don't know who "${decision.contactId ?? "that"}" is; only saved contacts can be paid`);
    const resource = fillEndpoint(contact, decision.amountUsdc, decision.qty);

    // 3. x402: the merchant states its price; the device builds the payment and checks it before signing anything.
    show({ phase: "requesting", headline: `Asking ${contact.name} for the bill`, episodeId: episode.id });
    let approvals: NonNullable<EpisodeRecord["approvals"]> = {};
    const result = await payX402(resource, {
      signal,
      approve: async (payment) => {
        const verdict = checkPayment({
          payment,
          contact,
          decidedAmountUsdc: decision.amountUsdc,
          rules: { deviceAccountId: config.hedera.accountId, usdcTokenId: config.hedera.usdcTokenId, spendLimitUsdc: config.spendLimitUsdc },
        });
        if (!verdict.ok) throw new Refused(verdict.reason);
        const amountUsdc = fromBaseUnits(payment.amount);
        const screenPayment = { amountUsdc, payTo: payment.payTo, payToName: contact.name, merchant: contact.name, overLimit: verdict.overLimit };
        episode.payment = { amountUsdc, payTo: payment.payTo, merchant: contact.name, resource, overLimit: verdict.overLimit };

        if (verdict.overLimit) {
          // 4. Over the limit: the screen shows what the device is about to sign; thumb first, then World ID.
          gpio.buzz(400);
          show({ phase: "awaiting_thumb", headline: "Press your thumb to approve", detail: `Over your ${config.spendLimitUsdc} USDC limit`, payment: screenPayment, episodeId: episode.id });
          say(`This is ${amountUsdc} dollars to ${contact.name}, over your limit. Press your thumb to approve.`);
          const thumb = await approveWithFingerprint(signal);
          approvals.fingerprint = thumb;
          if (!thumb) throw new Refused("Thumb not recognised or timed out");

          const world = await requestWorldApproval({ amountUsdc, payTo: payment.payTo, merchant: contact.name, episodeId: episode.id }, signal);
          show({
            phase: "awaiting_world",
            headline: "Approve in World App",
            detail: "Scan with your phone",
            payment: screenPayment,
            worldApproval: { url: world.url, qrSvg: await QRCode.toString(world.url, { type: "svg", margin: 0 }), expiresAt: world.expiresAt },
            episodeId: episode.id,
          });
          say("Now approve it in World App.");
          const proof = await world.result;
          approvals.world = { verified: proof.verified, reference: proof.reference };
          if (!proof.verified) throw new Refused(proof.reason ?? "World ID approval was not completed");
        }

        show({ phase: "paying", headline: `Paying ${amountUsdc} USDC`, detail: `to ${contact.name}`, payment: screenPayment, episodeId: episode.id });
      },
    });
    episode.approvals = approvals;
    episode.payment = { ...episode.payment!, hederaTxId: result.hederaTxId };

    // 5. Device-signed entry in the HCS spending diary.
    show({ phase: "logging", headline: "Writing receipt to Hedera", episodeId: episode.id });
    episode.spendLog = await appendSpendLog({
      v: 1,
      kind: "payment",
      hederaTxId: result.hederaTxId,
      amountUsdc: episode.payment.amountUsdc,
      tokenId: config.hedera.usdcTokenId,
      payTo: episode.payment.payTo,
      merchant: contact.name,
      resource,
      overLimit: episode.payment.overLimit,
      approvals: { fingerprint: !!approvals.fingerprint, world: !!approvals.world?.verified, worldReference: approvals.world?.reference },
      zgRequestId: requestId,
      memoryRootHash: episode.memory.rootHash,
      memoryTxHash: episode.memory.txHash,
      at: new Date().toISOString(),
    });

    episode.outcome = "paid";
    show({
      phase: "paid",
      headline: "Paid",
      detail: `${episode.payment.amountUsdc} USDC to ${contact.name} · ${hashscanTx(result.hederaTxId)}`,
      episodeId: episode.id,
    });
    gpio.buzz(80);
    say("Done.");
  }
}
