"use client";

import { useEffect, useState } from "react";
import { hashscanTxId, type Network, zgChainscanTx } from "@/lib/mirror";

/** Mirrors device/src/state.ts. The device feed is read-only; it cannot start or approve anything. */
type Screen = {
  phase: string;
  headline: string;
  detail?: string;
  brainOnline: boolean;
  payment?: { amountUsdc: string; payTo: string; payToName?: string; overLimit: boolean };
  updatedAt: string;
};

type Episode = {
  id: string;
  startedAt: string;
  heard?: string;
  saw?: string;
  outcome?: "paid" | "refused" | "answered" | "safe_mode" | "error";
  reason?: string;
  zg?: { requestId: string; model: string; teeVerified: boolean | null };
  memory?: { rootHash: string; txHash: string };
  payment?: { amountUsdc: string; merchant: string; overLimit: boolean; hederaTxId?: string };
  approvals?: { fingerprint?: boolean; world?: { verified: boolean } };
};

const OUTCOME: Record<NonNullable<Episode["outcome"]>, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-green-00" },
  refused: { label: "Refused", className: "bg-red-00" },
  answered: { label: "Answered", className: "bg-grey-04" },
  safe_mode: { label: "Safe mode", className: "bg-red-00" },
  error: { label: "Error", className: "bg-red-00" },
};

export function DevicePanel({ network }: { network: Network }) {
  const base = process.env.NEXT_PUBLIC_DEVICE_URL?.replace(/\/$/, "") || null;
  const [screen, setScreen] = useState<Screen | null>(null);
  const [episodes, setEpisodes] = useState<Episode[] | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!base) return;
    let source: EventSource | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = async () => {
      try {
        const res = await fetch(`${base}/api/state`, { cache: "no-store" });
        if (!res.ok) throw new Error(`Device answered ${res.status}`);
        const body = (await res.json()) as { screen: Screen; episodes: Episode[] };
        setScreen(body.screen);
        setEpisodes(body.episodes);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 5000);
        return;
      }
      source = new EventSource(`${base}/api/events`);
      source.onopen = () => setConnected(true);
      source.addEventListener("screen", (e) => setScreen(JSON.parse((e as MessageEvent).data)));
      source.addEventListener("episode", (e) => {
        const episode = JSON.parse((e as MessageEvent).data) as Episode;
        setEpisodes((list) => [episode, ...(list ?? []).filter((x) => x.id !== episode.id)].slice(0, 50));
      });
      source.onerror = () => {
        setConnected(false);
        source?.close();
        if (!closed) retry = setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      closed = true;
      source?.close();
      if (retry) clearTimeout(retry);
    };
  }, [base]);

  return (
    <section data-dash-in className="mx-[15px] flex flex-col border border-grey-02" aria-label="Device">
      <header className="flex items-end justify-between gap-[10px] border-b border-grey-02 bg-grey-01 px-[14px] py-[12px]">
        <div>
          <h2 className="text-[22px] tracking-[-0.02em]">Device</h2>
          <p className="text-[13px] text-grey-04">Live from the Leash device, including refusals and safe mode</p>
        </div>
        <span className="flex items-center gap-[8px] font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">
          <span className={`h-[8px] w-[8px] ${connected ? "bg-green-00" : "bg-red-00"}`} />
          {base ? (connected ? "connected" : "offline") : "not configured"}
        </span>
      </header>

      {!base ? (
        <p className="p-[14px] text-[14px] text-grey-04">
          Set <code className="font-mono">NEXT_PUBLIC_DEVICE_URL</code> (e.g. http://leash.local:7070) in{" "}
          <code className="font-mono">web/.env.local</code>.
        </p>
      ) : (
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div className="flex flex-col gap-[10px] border-b border-grey-02 p-[14px] lg:border-b-0 lg:border-r">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">
              {screen ? screen.phase.replace(/_/g, " ") : "—"} · 0G {screen?.brainOnline ? "online" : "offline"}
            </span>
            <p className="text-[28px] leading-[1.05] tracking-[-0.03em]">{screen?.headline ?? "Waiting for the device…"}</p>
            {screen?.detail && <p className="break-words text-[14px] text-grey-04">{screen.detail}</p>}
            {screen?.payment && (
              <p className="border border-grey-02 p-[10px] text-[18px]">
                {screen.payment.amountUsdc} USDC
                <span className="text-grey-04"> → {screen.payment.payToName ?? screen.payment.payTo}</span>
                {screen.payment.overLimit && <span className="block font-mono text-[11px] text-red-00">over limit: thumb + World ID</span>}
              </p>
            )}
            {error && <p className="font-mono text-[11px] text-red-00">{error}</p>}
          </div>

          <ul className="flex max-h-[420px] flex-col overflow-y-auto">
            {episodes?.length === 0 && <li className="p-[14px] text-[14px] text-grey-04">No requests yet.</li>}
            {episodes?.slice(0, 20).map((ep) => {
              const outcome = ep.outcome ? OUTCOME[ep.outcome] : null;
              return (
                <li key={ep.id} data-row={`ep-${ep.id}`} className="grid gap-[4px] border-b border-grey-02 px-[14px] py-[12px]">
                  <div className="flex items-center justify-between gap-[10px] font-mono text-[11px] uppercase tracking-[0.04em] text-grey-04">
                    <span className="flex items-center gap-[6px]">
                      {outcome && <span className={`h-[8px] w-[8px] ${outcome.className}`} />}
                      {outcome?.label ?? "running"}
                    </span>
                    <span>{new Date(ep.startedAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-[16px]">&ldquo;{ep.heard}&rdquo;</p>
                  {ep.payment && (
                    <p className="text-[14px] text-grey-04">
                      {ep.payment.amountUsdc} USDC → {ep.payment.merchant}
                      {ep.payment.overLimit && " · over limit"}
                    </p>
                  )}
                  {ep.reason && ep.outcome !== "paid" && <p className="text-[13px] text-grey-04">{ep.reason}</p>}
                  <p className="flex flex-wrap gap-x-[14px] font-mono text-[11px] text-grey-04">
                    {ep.zg && (
                      <span className="break-all">
                        0G {ep.zg.requestId}
                        {ep.zg.teeVerified ? " · TEE verified" : ""}
                      </span>
                    )}
                    {ep.memory && (
                      <a href={zgChainscanTx(ep.memory.txHash)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        memory on 0G
                      </a>
                    )}
                    {ep.payment?.hederaTxId && (
                      <a href={hashscanTxId(network, ep.payment.hederaTxId)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                        payment on HashScan
                      </a>
                    )}
                  </p>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
