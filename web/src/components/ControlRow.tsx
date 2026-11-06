"use client";

type ControlRowProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
};

/** A labelled slider row in the style of a tool control panel. */
export function ControlRow({ label, value, min, max, step, onChange, format }: ControlRowProps) {
  const fill = ((value - min) / (max - min)) * 100;
  const id = `ctl-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="grid grid-cols-[1fr_110px_44px] items-center gap-[10px] py-[9px] lg:grid-cols-[1fr_120px_48px]">
      <label htmlFor={id} className="text-[14px] text-ink">
        {label}
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="leash-range"
        style={{ ["--fill" as string]: `${fill}%` }}
      />
      <output
        htmlFor={id}
        className="flex h-[24px] items-center justify-center bg-grey-01 font-mono text-[11px] tabular-nums text-ink"
      >
        {format ? format(value) : value}
      </output>
    </div>
  );
}
