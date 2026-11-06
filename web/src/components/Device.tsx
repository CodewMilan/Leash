import type { CSSProperties } from "react";

export type DeviceState =
  | "idle"
  | "listening"
  | "thinking"
  | "auto"
  | "thumb"
  | "paid"
  | "offline"
  | "refused";

export const STATE_META: Record<
  DeviceState,
  { label: string; accent: string; caption: string }
> = {
  idle: { label: "READY", accent: "#b2b2b2", caption: "Press to talk" },
  listening: { label: "LISTENING", accent: "#2d4ff9", caption: "Speech to text, on device" },
  thinking: { label: "THINKING · 0G", accent: "#a199ff", caption: "Asking 0G" },
  auto: { label: "AUTO-PAY", accent: "#36d972", caption: "Under your limit" },
  thumb: { label: "THUMB REQUIRED", accent: "#ff942e", caption: "Over your limit" },
  paid: { label: "PAID", accent: "#36d972", caption: "Settled on Hedera" },
  offline: { label: "BRAIN OFFLINE", accent: "#ff3f3f", caption: "Will not pay" },
  refused: { label: "PAYMENT REFUSED", accent: "#ff3f3f", caption: "Nothing moved" },
};

type DeviceProps = {
  state: DeviceState;
  amount?: string;
  recipient?: string;
  limit?: string;
  led?: string;
  ledLevel?: number;
  className?: string;
  style?: CSSProperties;
};

const MONO = { fontFamily: "var(--font-mono)" } as const;
const BOOK = { fontFamily: "var(--font-book)" } as const;

export function Device({
  state,
  amount = "2.00",
  recipient = "Chai stall",
  limit = "5.00",
  led,
  ledLevel = 1,
  className,
  style,
}: DeviceProps) {
  const meta = STATE_META[state];
  const ledColor = led ?? meta.accent;
  const showAmount = state === "auto" || state === "thumb" || state === "paid" || state === "refused";
  const footer =
    state === "auto"
      ? `under limit ${limit}`
      : state === "thumb"
        ? `over limit ${limit}`
        : state === "paid"
          ? "receipt on HashScan"
          : state === "refused"
            ? "nothing was signed"
            : state === "offline"
              ? "can talk, won't pay"
              : state === "thinking"
                ? "decision + request ID"
                : state === "listening"
                  ? "whisper, on device"
                  : `limit ${limit} USDC`;

  return (
    <svg
      viewBox="0 0 300 520"
      className={className}
      style={style}
      role="img"
      aria-label={`Leash device: ${meta.label.toLowerCase()}${showAmount ? `, ${amount} USDC to ${recipient}` : ""}`}
    >
      <rect x="10" y="10" width="280" height="500" rx="36" fill="#1f1f1f" />
      <rect x="10.5" y="10.5" width="279" height="499" rx="35.5" fill="none" stroke="#3a3a3a" />

      <circle cx="150" cy="42" r="10" fill="#0d0d0d" stroke="#3a3a3a" />
      <circle cx="150" cy="42" r="4" fill="#26324d" />
      <circle cx="246" cy="42" r="11" fill={ledColor} opacity={0.18 * ledLevel} />
      <circle cx="246" cy="42" r="5.5" fill={ledColor} opacity={0.35 + 0.65 * ledLevel} />
      <circle cx="54" cy="42" r="3" fill="#3a3a3a" />

      <rect x="34" y="70" width="232" height="204" rx="10" fill="#0e0e0e" />
      <rect x="34" y="70" width="232" height="26" rx="10" fill={meta.accent} />
      <rect x="34" y="86" width="232" height="10" fill={meta.accent} />
      <text x="48" y="88" fontSize="11" fontWeight="600" letterSpacing="1" fill="#0e0e0e" style={MONO}>
        {meta.label}
      </text>

      {showAmount && (
        <g>
          <text x="48" y="160" fontSize="52" fill="#fafafa" letterSpacing="-2" style={BOOK}>
            {amount}
          </text>
          <text x="48" y="182" fontSize="12" fill="#b2b2b2" letterSpacing="1" style={MONO}>
            USDC
          </text>
          <text x="48" y="222" fontSize="17" fill="#fafafa" style={BOOK}>
            {"→ " + recipient}
          </text>
        </g>
      )}

      {state === "listening" && (
        <g fill={meta.accent}>
          {[18, 34, 52, 30, 64, 42, 24, 56, 38, 20, 46, 28].map((h, i) => (
            <rect key={i} x={54 + i * 16} y={170 - h / 2} width="8" height={h} rx="2" />
          ))}
        </g>
      )}

      {state === "thinking" && (
        <g fill={meta.accent}>
          <circle cx="122" cy="168" r="9" />
          <circle cx="150" cy="168" r="9" opacity="0.6" />
          <circle cx="178" cy="168" r="9" opacity="0.3" />
        </g>
      )}

      {state === "idle" && (
        <text x="150" y="176" textAnchor="middle" fontSize="26" fill="#fafafa" style={BOOK}>
          Hi, I&apos;m Leash
        </text>
      )}

      {state === "offline" && (
        <g>
          <circle cx="150" cy="160" r="30" fill="none" stroke={meta.accent} strokeWidth="6" />
          <line x1="129" y1="181" x2="171" y2="139" stroke={meta.accent} strokeWidth="6" />
        </g>
      )}

      <text x="48" y="258" fontSize="10" fill="#8a8a8a" letterSpacing="0.6" style={MONO}>
        {footer}
      </text>

      <g fill="#333">
        {Array.from({ length: 5 }).map((_, r) =>
          Array.from({ length: 12 }).map((__, c) => (
            <circle key={`${r}-${c}`} cx={73 + c * 14} cy={298 + r * 9} r="1.8" />
          )),
        )}
      </g>

      <circle cx="150" cy="392" r="48" fill="#2a2a2a" stroke="#3a3a3a" />
      <g
        fill="none"
        stroke={state === "thumb" ? meta.accent : state === "paid" ? "#36d972" : "#4a4a4a"}
        strokeWidth="2.4"
        strokeLinecap="round"
      >
        <path d="M128 392 a22 22 0 0 1 44 0" />
        <path d="M120 400 a30 30 0 0 1 60 -8" />
        <path d="M136 396 a14 14 0 0 1 28 -4" />
        <path d="M144 398 a6 6 0 0 1 12 -2" />
        <path d="M126 410 a26 26 0 0 0 30 12" />
        <path d="M136 408 a16 16 0 0 0 26 2" />
        <path d="M168 404 a20 20 0 0 1 -6 18" />
      </g>

      <g>
        <rect x="58" y="460" width="52" height="24" rx="12" fill="#2a2a2a" />
        <rect x="124" y="460" width="52" height="24" rx="12" fill="#2a2a2a" />
        <rect x="190" y="460" width="52" height="24" rx="12" fill="#2a2a2a" />
        <text x="84" y="476" textAnchor="middle" fontSize="9" fill="#8a8a8a" style={MONO}>
          TALK
        </text>
        <text x="150" y="476" textAnchor="middle" fontSize="9" fill="#8a8a8a" style={MONO}>
          OK
        </text>
        <text x="216" y="476" textAnchor="middle" fontSize="9" fill="#8a8a8a" style={MONO}>
          NO
        </text>
      </g>
    </svg>
  );
}

/** Small glyph of the device used inside chips, posters and the headline media box. */
export function DeviceGlyph({ state, className }: { state: DeviceState; className?: string }) {
  const accent = STATE_META[state].accent;
  return (
    <svg viewBox="0 0 60 100" className={className} aria-hidden="true">
      <rect x="2" y="2" width="56" height="96" rx="10" fill="#1f1f1f" />
      <rect x="8" y="14" width="44" height="38" rx="3" fill="#0e0e0e" />
      <rect x="8" y="14" width="44" height="7" rx="3" fill={accent} />
      <rect x="14" y="30" width={state === "offline" ? 14 : 26} height="6" rx="1" fill="#fafafa" />
      <rect x="14" y="40" width="18" height="3" rx="1" fill="#8a8a8a" />
      <circle cx="47" cy="8" r="2" fill={accent} />
      <circle cx="30" cy="72" r="11" fill="#2a2a2a" />
      <path
        d="M24 72 a6 6 0 0 1 12 0 M21 75 a9 9 0 0 1 18 -3"
        fill="none"
        stroke={state === "thumb" ? accent : "#555"}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
