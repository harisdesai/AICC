import React from "react";
import { clsx } from "clsx";

export function Button({ children, variant = "primary", size = "md", className, disabled, loading, ...props }) {
  const base = "inline-flex items-center justify-center font-medium transition-all rounded-full border select-none";
  const variants = {
    primary: "bg-[--accent] border-[--accent] text-white hover:bg-[--accent2] hover:border-[--accent2] disabled:opacity-50",
    ghost: "bg-transparent border-[color:var(--border2)] text-[--text2] hover:bg-[--bg3] hover:text-[--text] disabled:opacity-40",
    danger: "bg-[--red-dim] border-[color:rgba(248,113,113,0.3)] text-[--red] hover:bg-[rgba(248,113,113,0.2)]",
    success: "bg-[--green-dim] border-[color:rgba(45,212,160,0.3)] text-[--green]",
  };
  const sizes = {
    sm: "text-[13px] px-4 py-1.5 gap-1.5",
    md: "text-[14px] px-5 py-2.5 gap-2",
    lg: "text-[16px] px-7 py-3.5 gap-2.5",
  };
  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      style={{ fontFamily: "Outfit, sans-serif" }}
      {...props}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  );
}

export function Input({ label, error, className, ...props }) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      {label && <label style={{ fontSize: 13, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.8px" }}>{label}</label>}
      <input
        style={{
          background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)",
          borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 14, outline: "none",
          transition: "border-color 0.15s", width: "100%",
        }}
        onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border2)"; }}
        {...props}
      />
      {error && <span style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>}
    </div>
  );
}

export function Card({ children, className, style, ...props }) {
  return (
    <div
      style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", ...style }}
      className={className}
      {...props}
    >
      {children}
    </div>
  );
}

export function Spinner({ size = 20, color = "var(--accent)" }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      border: `2px solid ${color}30`,
      borderTopColor: color,
      animation: "spin 0.7s linear infinite",
      flexShrink: 0,
    }} />
  );
}

export function Tag({ children, color = "default" }) {
  const colors = {
    default: { bg: "var(--bg4)", border: "var(--border2)", text: "var(--text2)" },
    green: { bg: "var(--green-dim)", border: "rgba(45,212,160,0.2)", text: "var(--green)" },
    accent: { bg: "var(--accent-dim)", border: "rgba(124,107,255,0.2)", text: "var(--accent2)" },
    amber: { bg: "var(--amber-dim)", border: "rgba(245,158,11,0.2)", text: "var(--amber)" },
    red: { bg: "var(--red-dim)", border: "rgba(248,113,113,0.2)", text: "var(--red)" },
  };
  const c = colors[color] || colors.default;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      background: c.bg, border: `1px solid ${c.border}`, color: c.text,
      borderRadius: 20, padding: "3px 10px", fontSize: 12,
    }}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, max = 100, color = "var(--accent)" }) {
  const pct = Math.round(Math.min(100, Math.max(0, (value / max) * 100)));
  return (
    <div style={{ height: 4, background: "var(--bg4)", borderRadius: 2, overflow: "hidden" }}>
      <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2, transition: "width 0.6s ease" }} />
    </div>
  );
}

export function ScoreRing({ score, size = 80 }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  const color = score >= 80 ? "var(--green)" : score >= 60 ? "var(--amber)" : "var(--red)";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg4)" strokeWidth={6} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 1s ease" }}
      />
      <text x={size / 2} y={size / 2 + 6} textAnchor="middle"
        style={{ fill: color, fontSize: size * 0.25, fontWeight: 600, fontFamily: "DM Mono, monospace", transform: `rotate(90deg) translate(0, -${size}px)` }}>
        {score}
      </text>
    </svg>
  );
}

export function MetricCard({ label, value, delta, deltaUp, color = "var(--text)" }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: "20px" }}>
      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 600, color, lineHeight: 1, marginBottom: 8 }}>{value}</div>
      {delta && <div style={{ fontSize: 12, color: deltaUp ? "var(--green)" : "var(--red)" }}>{deltaUp ? "↑" : "↓"} {delta}</div>}
    </div>
  );
}
