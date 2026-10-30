import React from "react";
import { useCurrentFrame } from "remotion";

// Invented footage, drawn as 16:9 vector scenes that fill and crop like video.
// `t` offsets the motion so a thumbnail and the preview can differ.

const Fill: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <svg viewBox="0 0 160 90" preserveAspectRatio="xMidYMid slice" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", ...style }}>
    {children}
  </svg>
);

export const Beach: React.FC<{ t?: number }> = ({ t = 0 }) => {
  const f = useCurrentFrame() + t;
  const wave = (y: number, k: number) =>
    `M0 ${y} ` + Array.from({ length: 17 }, (_, i) => `L${i * 10} ${y + Math.sin(i * 0.9 + f / 14 + k) * 0.9}`).join(" ") + " L160 90 L0 90 Z";
  return (
    <Fill>
      <defs>
        <linearGradient id="bsky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6b77c" />
          <stop offset="0.55" stopColor="#f3d2a2" />
          <stop offset="1" stopColor="#bfe0dd" />
        </linearGradient>
        <linearGradient id="bsea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b8ea5" />
          <stop offset="1" stopColor="#1f5f78" />
        </linearGradient>
      </defs>
      <rect width="160" height="90" fill="url(#bsky)" />
      <circle cx={112 - f * 0.02} cy={36 + f * 0.01} r="11" fill="#fff1d6" opacity="0.95" />
      <path d="M0 46 L28 40 L46 44 L70 37 L92 45 L160 44 L160 50 L0 50 Z" fill="#8aa6a6" opacity="0.7" />
      <rect y="48" width="160" height="42" fill="url(#bsea)" />
      <path d={wave(60, 0)} fill="#4ea3b5" opacity="0.6" />
      <path d={wave(68, 2)} fill="#e9f3ee" opacity="0.85" />
      <path d={wave(70, 2.4)} fill="#e8cf9f" />
      <path d="M0 80 Q60 72 160 78 L160 90 L0 90 Z" fill="#dcbc84" />
    </Fill>
  );
};

export const Coast: React.FC<{ t?: number }> = ({ t = 0 }) => {
  const f = useCurrentFrame() + t;
  const dx = -f * 0.08;
  return (
    <Fill>
      <rect width="160" height="90" fill="#2f6f7c" />
      <g transform={`translate(${dx % 40} 0)`}>
        {[0, 40, 80, 120, 160].map((x) => (
          <path key={x} d={`M${x} 0 C${x + 18} 20 ${x + 4} 50 ${x + 26} 90 L${x + 60} 90 L${x + 60} 0 Z`} fill="#3f7a4c" />
        ))}
        {[0, 40, 80, 120, 160].map((x) => (
          <path key={`s${x}`} d={`M${x} 0 C${x + 18} 20 ${x + 4} 50 ${x + 26} 90`} stroke="#f2ead6" strokeWidth="2.4" fill="none" opacity="0.85" />
        ))}
      </g>
      <rect width="160" height="90" fill="#0b1c22" opacity="0.12" />
    </Fill>
  );
};

export const Sunset: React.FC<{ t?: number }> = ({ t = 0 }) => {
  const f = useCurrentFrame() + t;
  return (
    <Fill>
      <defs>
        <linearGradient id="ssky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2a5c" />
          <stop offset="0.6" stopColor="#c9637a" />
          <stop offset="1" stopColor="#f2a65a" />
        </linearGradient>
      </defs>
      <rect width="160" height="90" fill="url(#ssky)" />
      <circle cx="80" cy={60 + f * 0.04} r="14" fill="#ffd27a" />
      <path d="M0 62 L30 52 L52 58 L80 48 L110 57 L132 50 L160 58 L160 90 L0 90 Z" fill="#2a1d3b" />
    </Fill>
  );
};

export const Dinner: React.FC<{ t?: number }> = ({ t = 0 }) => {
  const f = useCurrentFrame() + t;
  return (
    <Fill>
      <rect width="160" height="90" fill="#3a2a1c" />
      {[20, 60, 100, 140].map((x, i) => (
        <circle key={x} cx={x} cy={18 + Math.sin(f / 20 + i) * 1.5} r="9" fill="#ffcf7a" opacity="0.35" />
      ))}
      <rect y="58" width="160" height="32" fill="#6b4a2c" />
      <path d="M48 58 L52 34 L60 34 L64 58 Z M96 58 L100 34 L108 34 L112 58 Z" fill="#f4e3c3" opacity="0.8" />
      <rect x="52" y="36" width="8" height="10" fill="#b8323e" opacity="0.8" />
      <rect x="100" y="36" width="8" height="10" fill="#b8323e" opacity="0.8" />
    </Fill>
  );
};

// A presenter shot against a green screen. `keyed` removes the green (0..1).
export const Host: React.FC<{ keyed?: number; t?: number }> = ({ keyed = 0, t = 0 }) => {
  const f = useCurrentFrame() + t;
  const bob = Math.sin(f / 16) * 0.6;
  return (
    <Fill>
      <rect width="160" height="90" fill="#00b140" opacity={1 - keyed} />
      <g transform={`translate(0 ${bob})`}>
        <path d="M54 92 C54 70 64 62 80 62 C96 62 106 70 106 92 Z" fill="#26313f" />
        <path d="M74 60 L86 60 L85 66 L75 66 Z" fill="#c98f6c" />
        <ellipse cx="80" cy="47" rx="11" ry="13" fill="#dca07c" />
        <path d="M69 45 C68 33 92 31 91 45 C90 38 72 37 69 45 Z" fill="#2b1d16" />
        <path d="M76 66 L80 76 L84 66" stroke="#e8eef2" strokeWidth="1.6" fill="none" />
      </g>
    </Fill>
  );
};

// A title overlay, as the editor renders text clips.
export const Title: React.FC<{ text: string; size?: string; opacity?: number }> = ({ text, size = "9cqw", opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      bottom: "14%",
      textAlign: "center",
      fontWeight: 800,
      fontSize: size,
      letterSpacing: "-0.02em",
      color: "#fff",
      textShadow: "0 2px 12px rgba(0,0,0,0.45)",
      opacity,
    }}
  >
    {text}
  </div>
);
