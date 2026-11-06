"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SectionLabel } from "@/components/SectionLabel";
import { EASE, gsap, prefersReducedMotion, useGSAP } from "@/lib/gsap";
import {
  type Balances,
  fetchBalances,
  fetchSpendLog,
  fetchUsdcTransfers,
  formatTimestamp,
  hashscanAccount,
  hashscanTopic,
  hashscanTx,
  hashscanTxId,
  type LogMessage,
  readConfig,
  type Transfer,
  zgChainscanTx,
} from "@/lib/mirror";
import { DevicePanel } from "@/components/dashboard/DevicePanel";

const POLL_MS = 5000;

type Section<T> = { data: T | null; error: string | null };

const empty = <T,>(): Section<T> => ({ data: null, error: null });

function errorText(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

export function Dashboard() {
  const { config, missing } = readConfig();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useRef(new Set<string>());
  const [balances, setBalances] = useState<Section<Balances>>(empty);
  const [log, setLog] = useState<Section<LogMessage[]>>(empty);
  const [transfers, setTransfers] = useState<Section<Transfer[]>>(empty);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const { network, accountId, topicId, usdcTokenId } = config;
    const jobs: Promise<void>[] = [];
    if (accountId && usdcTokenId) {
      jobs.push(
        fetchBalances(network, accountId, usdcTokenId)
          .then((data) => setBalances({ data, error: null }))
          .catch((e) => setBalances((s) => ({ ...s, error: errorText(e) }))),
        fetchUsdcTransfers(network, accountId, usdcTokenId)
          .then((data) => setTransfers({ data, error: null }))
          .catch((e) => setTransfers((s) => ({ ...s, error: errorText(e) }))),
      );
    }
    if (topicId) {
      jobs.push(
        fetchSpendLog(network, topicId)
          .then((data) => setLog({ data, error: null }))
          .catch((e) => setLog((s) => ({ ...s, error: errorText(e) }))),
      );
    }
    await Promise.all(jobs);
    setUpdatedAt(new Date());
  }, [config.network, config.accountId, config.topicId, config.usdcTokenId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const first = setTimeout(load, 0);
    const id = setInterval(load, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  useGSAP(
    () => {
      if (prefersReducedMotion()) return;
      gsap.from("[data-dash-in]", { y: 24, opacity: 0, duration: 0.7, ease: EASE.out, stagger: 0.06 });
    },
    { scope: ref },
  );

  useGSAP(
    () => {
      const fresh = gsap.utils
        .toArray<HTMLElement>("[data-row]")
        .filter((el) => !seen.current.has(el.dataset.row!));
      fresh.forEach((el) => seen.current.add(el.dataset.row!));
      if (prefersReducedMotion() || fresh.length === 0) return;
      gsap.fromTo(
        fresh,
        { y: 10, opacity: 0, backgroundColor: "#ffe5f7" },
        { y: 0, opacity: 1, backgroundColor: "rgba(250,250,250,0)", duration: 0.8, ease: EASE.out, stagger: 0.03 },
      );
    },
    { dependencies: [log.data, transfers.data], scope: ref },
  );

  const net = config.network;

  return (
    <div ref={ref} className="flex flex-col gap-[30px] pb-[90px] pt-[50px]">
      <div data-dash-in>
        <SectionLabel>Live log</SectionLabel>
        <div className="flex flex-col gap-[14px] px-[15px] pt-[16px] lg:flex-row lg:items-end lg:justify-between">
          <h1 className="display-2 font-normal">Every payment, as it lands</h1>
          <p className="flex items-center gap-[8px] font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">
            <span className="relative flex h-[8px] w-[8px]">
              {missing.length === 0 && <span className="absolute inset-0 animate-ping bg-green-00 opacity-60" />}
              <span className={`relative h-[8px] w-[8px] ${missing.length === 0 ? "bg-green-00" : "bg-red-00"}`} />
            </span>
            {missing.length === 0 ? (
              <>
                Hedera {net} · refreshes every {POLL_MS / 1000}s
                {updatedAt && ` · ${updatedAt.toLocaleTimeString()}`}
              </>
            ) : (
              "Not connected"
            )}
          </p>
        </div>
      </div>

      {missing.length > 0 && (
        <div data-dash-in className="mx-[15px] border border-red-00 bg-red-05/40 p-[16px]" role="alert">
          <p className="mb-[6px] text-[18px]">Dashboard isn&apos;t fully configured</p>
          <p className="mb-[10px] text-[14px] text-grey-04">
            Set these in <code className="font-mono">web/.env.local</code> and restart the dev server. Nothing is
            shown until they point at real accounts.
          </p>
          <ul className="flex flex-col gap-[4px] font-mono text-[12px]">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}

      <div data-dash-in className="mx-[15px] grid gap-[10px] sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="USDC balance"
          value={
            balances.data ? (balances.data.usdc === null ? "Not associated" : balances.data.usdc.toFixed(2)) : "—"
          }
          error={balances.error}
          href={config.accountId ? hashscanAccount(net, config.accountId) : undefined}
        />
        <Stat
          label="HBAR balance"
          value={balances.data ? balances.data.hbar.toFixed(2) : "—"}
          error={balances.error}
        />
        <Stat label="Spend log entries" value={log.data ? String(log.data.length) : "—"} error={log.error} />
        <Stat label="USDC transfers" value={transfers.data ? String(transfers.data.length) : "—"} error={transfers.error} />
      </div>

      <DevicePanel network={net} />

      <div className="mx-[15px] grid gap-[30px] lg:grid-cols-2 lg:gap-[10px]">
        <Panel
          title="Spend log"
          subtitle="Device-signed entries in the Hedera topic"
          link={config.topicId ? { href: hashscanTopic(net, config.topicId), label: config.topicId } : undefined}
          error={log.error}
          configured={!!config.topicId}
          emptyText="No entries in the topic yet."
          rows={log.data}
        >
          {log.data?.map((m) => (
            <li key={m.sequence} data-row={`log-${m.sequence}`} className="grid gap-[4px] border-b border-grey-02 px-[14px] py-[12px]">
              <div className="flex items-center justify-between gap-[10px] font-mono text-[11px] uppercase tracking-[0.04em] text-grey-04">
                <span>#{m.sequence}</span>
                <span>{formatTimestamp(m.timestamp)}</span>
              </div>
              {m.entry ? (
                <div className="grid gap-[2px]">
                  <p className="text-[18px] tracking-[-0.01em]">
                    {m.entry.amountUsdc ?? "?"} USDC
                    <span className="text-grey-04"> → {m.entry.merchant ?? m.entry.payTo ?? "unknown"}</span>
                  </p>
                  <p className="flex flex-wrap gap-x-[14px] font-mono text-[11px] text-grey-04">
                    <span>
                      approval:{" "}
                      {m.entry.overLimit
                        ? `thumb ${m.entry.approvals?.fingerprint ? "✓" : "✗"} · world ${m.entry.approvals?.world ? "✓" : "✗"}`
                        : "auto (under limit)"}
                    </span>
                    {m.entry.zgRequestId && <span className="break-all">0G request: {m.entry.zgRequestId}</span>}
                    {m.entry.memoryRootHash && <span className="break-all">memory: {m.entry.memoryRootHash}</span>}
                  </p>
                </div>
              ) : (
                <pre className="whitespace-pre-wrap break-all font-mono text-[12px]">{m.raw}</pre>
              )}
              <p className="flex flex-wrap gap-x-[14px] text-[13px]">
                {m.entry?.hederaTxId && (
                  <a href={hashscanTxId(net, m.entry.hederaTxId)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    Payment on HashScan
                  </a>
                )}
                <a href={hashscanTx(net, m.timestamp)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                  Log entry on HashScan
                </a>
                {m.entry?.memoryTxHash && (
                  <a href={zgChainscanTx(m.entry.memoryTxHash)} target="_blank" rel="noreferrer" className="underline underline-offset-4">
                    Memory on 0G
                  </a>
                )}
              </p>
            </li>
          ))}
        </Panel>

        <Panel
          title="USDC transfers"
          subtitle="Payments to and from the Leash account"
          link={config.accountId ? { href: hashscanAccount(net, config.accountId), label: config.accountId } : undefined}
          error={transfers.error}
          configured={!!config.accountId && !!config.usdcTokenId}
          emptyText="No USDC transfers on this account yet."
          rows={transfers.data}
        >
          {transfers.data?.map((t) => (
            <li key={t.id} data-row={`tx-${t.id}`} className="grid gap-[4px] border-b border-grey-02 px-[14px] py-[12px]">
              <div className="flex items-center justify-between gap-[10px] font-mono text-[11px] uppercase tracking-[0.04em] text-grey-04">
                <span>{t.result}</span>
                <span>{formatTimestamp(t.timestamp)}</span>
              </div>
              <p className="text-[18px] tracking-[-0.01em]">
                {t.amount > 0 ? "+" : ""}
                {t.amount.toFixed(2)} USDC
                <span className="text-grey-04">
                  {" "}
                  {t.amount < 0 ? "to" : "from"} {t.counterparty ?? "unknown"}
                </span>
              </p>
              <p className="break-all font-mono text-[11px] text-grey-04">{t.id}</p>
              <a href={hashscanTx(net, t.timestamp)} target="_blank" rel="noreferrer" className="justify-self-start text-[13px] underline underline-offset-4">
                View on HashScan
              </a>
            </li>
          ))}
        </Panel>
      </div>
    </div>
  );
}

function Stat({ label, value, error, href }: { label: string; value: string; error: string | null; href?: string }) {
  return (
    <div className="flex flex-col gap-[8px] border border-grey-02 p-[16px]">
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-grey-04">{label}</span>
      <span className="text-[40px] leading-none tracking-[-0.04em]">{value}</span>
      {error && <span className="font-mono text-[11px] text-red-00">{error}</span>}
      {href && !error && (
        <a href={href} target="_blank" rel="noreferrer" className="text-[13px] underline underline-offset-4">
          Account on HashScan
        </a>
      )}
    </div>
  );
}

function Panel({
  title,
  subtitle,
  link,
  error,
  configured,
  emptyText,
  rows,
  children,
}: {
  title: string;
  subtitle: string;
  link?: { href: string; label: string };
  error: string | null;
  configured: boolean;
  emptyText: string;
  rows: unknown[] | null;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-[420px] flex-col border border-grey-02" aria-label={title}>
      <header className="flex items-end justify-between gap-[10px] border-b border-grey-02 bg-grey-01 px-[14px] py-[12px]">
        <div>
          <h2 className="text-[22px] tracking-[-0.02em]">{title}</h2>
          <p className="text-[13px] text-grey-04">{subtitle}</p>
        </div>
        {link && (
          <a href={link.href} target="_blank" rel="noreferrer" className="font-mono text-[11px] underline underline-offset-4">
            {link.label}
          </a>
        )}
      </header>
      {!configured ? (
        <p className="p-[14px] text-[14px] text-grey-04">Not configured.</p>
      ) : error && !rows ? (
        <p className="p-[14px] font-mono text-[12px] text-red-00" role="alert">
          {error}
        </p>
      ) : rows === null ? (
        <p className="p-[14px] text-[14px] text-grey-04">Loading from the mirror node…</p>
      ) : rows.length === 0 ? (
        <p className="p-[14px] text-[14px] text-grey-04">{emptyText}</p>
      ) : (
        <ul className="flex flex-col">{children}</ul>
      )}
      {error && rows && (
        <p className="border-t border-grey-02 p-[10px] font-mono text-[11px] text-red-00">Last refresh failed: {error}</p>
      )}
    </section>
  );
}
