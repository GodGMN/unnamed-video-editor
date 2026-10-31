import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, SpringConfig, useCurrentFrame, useVideoConfig } from "remotion";
import { C, sans } from "../theme";

export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const x = 30 + Math.sin(frame / 90) * 12;
  const y = 20 + Math.cos(frame / 110) * 10;
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(1100px 700px at ${x}% ${y}%, rgba(198,240,191,0.12), transparent 70%),
          radial-gradient(900px 600px at ${100 - x}% ${100 - y}%, rgba(110,180,231,0.07), transparent 70%), ${C.stage}`,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "36px 36px",
          maskImage: "radial-gradient(ellipse at center, black 30%, transparent 80%)",
        }}
      />
    </AbsoluteFill>
  );
};

export const useSpring = (delay = 0, config: Partial<SpringConfig> = { damping: 200 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

// The scene's one word: it punches in big in the middle of the screen, then
// shrinks into the top-left corner to make room for the browser.
export const BigWord: React.FC<{ word: string; color?: string; settle?: number }> = ({ word, color = C.accent, settle = 16 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 11, stiffness: 180 } });
  const p = interpolate(frame, [settle, settle + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const lerp = (a: number, b: number) => a + (b - a) * p;
  return (
    <div
      style={{
        position: "absolute",
        left: lerp(960, 120),
        top: lerp(540, 40),
        transformOrigin: "0 0",
        transform: `translate(${lerp(-50, 0)}%, ${lerp(-50, 0)}%) scale(${lerp(1, 0.4) * (0.6 + 0.4 * pop)})`,
        fontFamily: sans,
        fontWeight: 800,
        fontSize: 220,
        letterSpacing: -6,
        lineHeight: 1,
        color,
        opacity: Math.min(1, pop * 1.5),
        whiteSpace: "nowrap",
        // Once settled it sits over the UI, so a dark halo keeps it legible.
        textShadow: `0 0 ${lerp(80, 30)}px ${color}55, 0 6px ${40 * p}px rgba(8,10,9,${0.9 * p}), 0 0 ${70 * p}px rgba(8,10,9,${0.8 * p})`,
        zIndex: 30,
      }}
    >
      {word}
    </div>
  );
};

// Pushes in on `origin` between the given frames.
export const Camera: React.FC<{ origin: [number, number]; keys: [number, number][]; children: React.ReactNode }> = ({
  origin,
  keys,
  children,
}) => {
  const frame = useCurrentFrame();
  const scale = interpolate(
    frame,
    keys.map((k) => k[0]),
    keys.map((k) => k[1]),
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) },
  );
  return <AbsoluteFill style={{ transform: `scale(${scale})`, transformOrigin: `${origin[0]}px ${origin[1]}px` }}>{children}</AbsoluteFill>;
};

// Slides its content up into place.
export const Rise: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const p = useSpring(0, { damping: 16, stiffness: 120 });
  return <AbsoluteFill style={{ opacity: p, transform: `translateY(${(1 - p) * 120}px)` }}>{children}</AbsoluteFill>;
};

// A pill label that pops in at `at` and, with `until`, shrinks away again.
export const Callout: React.FC<{
  at: number;
  until?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ at, until, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const inP = spring({ frame: frame - at, fps, config: { damping: 12, stiffness: 160 } });
  const outP = until === undefined ? 0 : interpolate(frame, [until, until + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const p = inP * (1 - outP);
  if (frame < at || outP >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 26px",
        borderRadius: 999,
        background: `linear-gradient(135deg, ${C.accent}, #a3e39a)`,
        color: C.bg,
        fontFamily: sans,
        fontWeight: 700,
        fontSize: 30,
        boxShadow: "0 16px 50px rgba(198,240,191,0.3)",
        transform: `scale(${p}) rotate(${(1 - inP) * -6}deg)`,
        opacity: Math.min(1, p * 2),
        whiteSpace: "nowrap",
        zIndex: 40,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// The film-bracket mark (assets/icon.svg).
export const Mark: React.FC<{ size: number; tile?: boolean; style?: React.CSSProperties }> = ({ size, tile = true, style }) => (
  <svg width={size} height={size} viewBox="0 0 64 64" style={style}>
    {tile && <rect x="1" y="1" width="62" height="62" rx="13" fill={C.bg} stroke={C.lineStrong} strokeWidth="2" />}
    <path
      fill={C.accent}
      fillRule="evenodd"
      d="M12 12H28V20H20V44H28V52H12ZM14 23h4v4h-4zM14 30h4v4h-4zM14 37h4v4h-4zM52 12H36V20H44V44H36V52H52ZM46 23h4v4h-4zM46 30h4v4h-4zM46 37h4v4h-4zM28 25L40 32L28 39Z"
    />
  </svg>
);

export const APP_NAME = "[Unnamed Video Editor]";

export const Wordmark: React.FC<{ size: number; color?: string; reveal?: number }> = ({ size, color = C.text, reveal }) => {
  const frame = useCurrentFrame();
  const word = `${APP_NAME}.`;
  return (
    <span style={{ fontFamily: sans, fontWeight: 800, fontSize: size, letterSpacing: -size * 0.03, color, whiteSpace: "nowrap" }}>
      {word.split("").map((ch, i) => {
        const o = reveal === undefined ? 1 : interpolate(frame, [reveal + i * 0.8, reveal + 5 + i * 0.8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
        const accent = i === word.length - 1;
        return (
          <span key={i} style={{ opacity: o, display: "inline-block", whiteSpace: "pre", transform: `translateY(${(1 - o) * size * 0.25}px)`, color: accent ? C.accent : color }}>
            {ch}
          </span>
        );
      })}
    </span>
  );
};

export const Brand: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.4 }}>
    <Mark size={size * 1.25} />
    <Wordmark size={size} />
  </div>
);
