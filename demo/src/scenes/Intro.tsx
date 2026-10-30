import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Background, Mark, useSpring, Wordmark } from "../components/ui";
import { C, sans, SITE } from "../theme";

// The usual hurdles of editing a quick video.
const HURDLES: { text: string; x: number; y: number; r: number }[] = [
  { text: "Downloading… 4.2 GB", x: -420, y: 455, r: -3 },
  { text: "Create an account to export", x: 410, y: 440, r: 2.5 },
  { text: "Uploading your footage… 12 %", x: -390, y: 625, r: 2 },
  { text: "Free plan: watermark on export", x: 430, y: 610, r: -2.5 },
  { text: "Pro plan · $24.99 / month", x: -400, y: 795, r: -1.5 },
  { text: "Will it even run on this laptop?", x: 390, y: 785, r: 3 },
];

// The headline holds the stage, then moves up to make room for the hurdles.
const MOVE = 40;
const popAt = (i: number) => MOVE + 10 + i * 6;
// Then they all get swept away at once.
const SWEEP = 100;

const Hurdle: React.FC<{ i: number }> = ({ i }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { text, x, y, r } = HURDLES[i];
  const pop = spring({ frame: frame - popAt(i), fps, config: { damping: 11, stiffness: 220 } });
  const gone = interpolate(frame, [SWEEP + i, SWEEP + i + 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  const t = frame - popAt(i);
  const buzz = t > 0 && t < 12 ? Math.sin(t * 2.8) * (12 - t) * 0.5 : 0;
  if (frame < popAt(i) || gone >= 1) return null;
  const last = i === HURDLES.length - 1;
  return (
    <div
      style={{
        position: "absolute",
        left: 960 + x * (1 - gone),
        top: y + (560 - y) * gone,
        transform: `translate(-50%, -50%) rotate(${r + buzz}deg) scale(${pop * (1 - gone)})`,
        opacity: Math.min(1, pop * 2) * (1 - gone),
        display: "flex",
        alignItems: "center",
        gap: 20,
        padding: "22px 32px 22px 22px",
        borderRadius: 20,
        background: "#1c1617",
        border: "1px solid #4a2c2c",
        boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        whiteSpace: "nowrap",
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          background: last ? "#3a2f17" : "#3d1f1f",
          color: last ? "#fbbf24" : C.red,
          display: "grid",
          placeItems: "center",
          fontFamily: sans,
          fontWeight: 800,
          fontSize: 28,
        }}
      >
        {last ? "?" : "!"}
      </div>
      <div style={{ fontFamily: sans, fontWeight: 600, fontSize: 34, color: C.text, letterSpacing: -0.5 }}>{text}</div>
    </div>
  );
};

// The problem: a quick edit comes with a pile of friction.
export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const q = useSpring(3, { damping: 12, stiffness: 220 });
  const p = interpolate(frame, [MOVE, MOVE + 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const lerp = (a: number, b: number) => a + (b - a) * p;
  // The hurdles pile up and the screen gets jumpier with each one.
  const t = frame - popAt(0);
  const shake = t > 0 && frame < SWEEP ? Math.sin(t * 2.3) * Math.min(t, 40) * 0.06 : 0;
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ transform: `translate(${shake}px, ${shake * 0.6}px)` }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: lerp(350, 90),
            textAlign: "center",
            transformOrigin: "top center",
            transform: `scale(${lerp(1.4 - 0.4 * q, 0.62)})`,
            opacity: Math.min(1, q * 2),
            fontFamily: sans,
            fontWeight: 800,
            fontSize: 110,
            lineHeight: 1.1,
            letterSpacing: -3,
            color: C.text,
          }}
        >
          Cutting a quick video
          <br />
          shouldn’t be <span style={{ color: C.accent }}>this much work.</span>
        </div>
        {HURDLES.map((_, i) => (
          <Hurdle key={i} i={i} />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const TitleCard: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = useSpring(0, { damping: 12 });
  const tag = useSpring(20, { damping: 14 });
  const tag2 = useSpring(32, { damping: 14 });
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <div style={{ transform: `scale(${logo}) rotate(${(1 - logo) * -25}deg) translateY(${Math.sin(frame / 9) * 6}px)` }}>
            <Mark size={150} style={{ filter: "drop-shadow(0 20px 60px rgba(198,240,191,0.3))" }} />
          </div>
          <Wordmark size={112} reveal={3} />
        </div>
        <div style={{ marginTop: 50, fontFamily: sans, fontWeight: 600, fontSize: 58, color: C.text, opacity: tag, transform: `translateY(${(1 - tag) * 24}px)` }}>
          A video editor that lives in your browser.
        </div>
        <div style={{ marginTop: 6, fontFamily: sans, fontWeight: 600, fontSize: 58, color: C.accent, opacity: tag2, transform: `translateY(${(1 - tag2) * 24}px)` }}>
          Nothing to install. Nothing uploaded.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const logo = useSpring(0, { damping: 13 });
  const url = useSpring(16, { damping: 12 });
  const foot = useSpring(40);
  const feats = ["No install", "No sign-up", "Runs on your device", "Exports MP4"];
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: logo, transform: `scale(${0.8 + 0.2 * logo})`, display: "flex", alignItems: "center", gap: 28 }}>
          <Mark size={84} />
          <Wordmark size={68} />
        </div>
        <div
          style={{
            marginTop: 64,
            fontFamily: sans,
            fontWeight: 800,
            fontSize: 120,
            letterSpacing: -3,
            color: C.accent,
            opacity: url,
            transform: `scale(${0.7 + 0.3 * url})`,
            textShadow: "0 0 60px rgba(198,240,191,0.35)",
          }}
        >
          {SITE}
        </div>
        <div style={{ marginTop: 44, display: "flex", gap: 18 }}>
          {feats.map((f, i) => {
            const p = spring({ frame: frame - 34 - i * 5, fps: 30, config: { damping: 14, stiffness: 180 } });
            return (
              <div
                key={f}
                style={{
                  fontFamily: sans,
                  fontWeight: 600,
                  fontSize: 30,
                  color: C.text,
                  padding: "12px 26px",
                  borderRadius: 999,
                  border: `1px solid ${C.lineStrong}`,
                  background: C.panel,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 30}px)`,
                }}
              >
                {f}
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", bottom: 50, fontFamily: sans, fontSize: 24, color: C.dim, opacity: foot }}>
          Drop. Cut. Key. Reframe. Export. All in a browser tab.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// A still logo card that is fully drawn from frame 0, so the video's
// thumbnail shows the brand. It holds for half a second, then fades away.
export const Poster: React.FC = () => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [15, 24], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.in(Easing.cubic) });
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - out, transform: `scale(${1 - 0.08 * out})`, filter: `blur(${out * 8}px)` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <Mark size={150} style={{ filter: "drop-shadow(0 20px 60px rgba(198,240,191,0.3))" }} />
          <Wordmark size={112} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
