import React from "react";
import { AbsoluteFill, Easing, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { Pointer } from "../components/Editor";
import { Background, Mark, useSpring, Wordmark } from "../components/ui";
import { C, hand, mono, sans, SITE } from "../theme";

// The installer, the product and every number in it are invented.

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = { ...clamp, easing: Easing.inOut(Easing.cubic) };
const es = (n: number, digits = 1) => n.toFixed(digits).replace(".", ",");

// What the edit actually needs. The intro leaves it unticked; the outro ticks it.
const TODO = ["4 recortes", "3 fundidos", "exportar"];

const PostIt: React.FC<{ ticks?: number[]; style?: React.CSSProperties }> = ({ ticks = [], style }) => {
  const frame = useCurrentFrame();
  return (
    <div
      style={{
        position: "absolute",
        width: 360,
        padding: "34px 36px 40px",
        background: "linear-gradient(170deg, #fbe98a, #f2d65e)",
        boxShadow: "0 30px 60px rgba(0,0,0,0.5), inset 0 -10px 20px rgba(0,0,0,0.06)",
        color: "#2a2410",
        fontFamily: hand,
        fontWeight: 700,
        ...style,
      }}
    >
      <div style={{ position: "absolute", top: -14, left: 130, width: 100, height: 30, background: "rgba(255,255,255,0.45)", transform: "rotate(-3deg)" }} />
      <div style={{ fontSize: 50, lineHeight: 1, marginBottom: 18 }}>Lo que necesito:</div>
      {TODO.map((t, i) => {
        const tick = ticks[i] === undefined ? 0 : interpolate(frame, [ticks[i], ticks[i] + 8], [0, 1], clamp);
        return (
          <div key={t} style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 52, lineHeight: 1.2 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" style={{ flex: "none" }}>
              <rect x="5" y="7" width="28" height="28" rx="4" fill="none" stroke="#2a2410" strokeWidth="3" />
              <path d="M10 21 L18 29 L36 5" fill="none" stroke="#1f7a3a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="50" strokeDashoffset={50 * (1 - tick)} />
            </svg>
            <span style={{ opacity: 1 - 0.35 * tick }}>{t}</span>
          </div>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------- the installer

const LOG: [number, string, string][] = [
  [10, "✓", "Pack de 3.200 transiciones 3D (48 GB)"],
  [24, "✓", "12.000 plantillas de títulos (31 GB)"],
  [38, "✓", "Motor de partículas y explosiones (64 GB)"],
  [52, "↓", "Biblioteca de LUTs de cine (112 GB)"],
  [66, "·", "Asistente de IA generativa (230 GB)"],
  [78, "·", "Cuenta obligatoria para exportar"],
];

const WIN = { left: 600, top: 190, width: 1180 };
const MODAL = { left: 870, top: 400, width: 640 };
const CANCEL_BTN: [number, number] = [1190, 604];
const NO_SPACE = 88;
const CANCEL = 130;

const Installer: React.FC = () => {
  const frame = useCurrentFrame();
  const pct = 0.4 + frame * 0.0006;
  // Time left only ever grows.
  const mins = 192 + Math.floor(frame * 1.7);
  const stripes = (frame * 2) % 40;
  return (
    <div
      style={{
        position: "absolute",
        ...WIN,
        background: "#1b1d22",
        border: "1px solid #33363e",
        borderRadius: 22,
        boxShadow: "0 50px 120px rgba(0,0,0,0.6)",
        overflow: "hidden",
        fontFamily: sans,
        color: "#eceef3",
      }}
    >
      <div style={{ height: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 20px", background: "#15171b", borderBottom: "1px solid #2a2d34" }}>
        {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
          <div key={c} style={{ width: 14, height: 14, borderRadius: 7, background: c, opacity: 0.85 }} />
        ))}
        <span style={{ flex: 1, textAlign: "center", marginRight: 70, fontSize: 18, color: "#9aa0ad" }}>Instalador</span>
      </div>
      <div style={{ padding: "40px 48px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
          <div
            style={{
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "linear-gradient(135deg, #7c5cff, #ff6a3d)",
              display: "grid",
              placeItems: "center",
              fontWeight: 800,
              fontSize: 40,
              letterSpacing: -1,
            }}
          >
            Ep
          </div>
          <div>
            <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1 }}>Editor Pro Studio Suite 2026</div>
            <div style={{ fontSize: 24, color: "#9aa0ad", marginTop: 4 }}>Versión 26.4.1 · 890 GB</div>
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 40, fontSize: 24 }}>
          <span>Descargando componentes…</span>
          <span style={{ fontFamily: mono, fontWeight: 700 }}>{es(pct)} %</span>
        </div>
        <div style={{ height: 20, borderRadius: 10, background: "#2a2d34", marginTop: 14, overflow: "hidden" }}>
          <div
            style={{
              width: `max(14px, ${pct}%)`,
              height: "100%",
              borderRadius: 10,
              background: `repeating-linear-gradient(135deg, #7c5cff 0 10px, #9b82ff 10px 20px)`,
              backgroundPosition: `${stripes}px 0`,
            }}
          />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12, fontSize: 22, color: "#9aa0ad" }}>
          <span>
            {es((890 * pct) / 100)} GB de 890 GB
          </span>
          <span>
            Tiempo restante:{" "}
            <span style={{ color: "#ffb4a2", fontFamily: mono }}>
              {Math.floor(mins / 60)} h {String(mins % 60).padStart(2, "0")} min
            </span>
          </span>
        </div>
        <div
          style={{
            marginTop: 30,
            height: 230,
            padding: "18px 22px",
            borderRadius: 14,
            background: "#121317",
            border: "1px solid #2a2d34",
            fontFamily: mono,
            fontSize: 20,
            lineHeight: 1.75,
            color: "#b9bfcc",
            overflow: "hidden",
          }}
        >
          {LOG.filter(([at]) => frame >= at).map(([at, mark, line]) => (
            <div key={line} style={{ opacity: interpolate(frame, [at, at + 5], [0, 1], clamp), whiteSpace: "nowrap" }}>
              <span style={{ color: mark === "✓" ? "#7ee2a8" : mark === "↓" ? "#9b82ff" : "#6b7180" }}>{mark}</span> {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const NoSpace: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - NO_SPACE, fps, config: { damping: 11, stiffness: 220 } });
  const t = frame - NO_SPACE;
  const buzz = t > 0 && t < 12 ? Math.sin(t * 2.8) * (12 - t) * 0.6 : 0;
  const pressed = frame >= CANCEL && frame < CANCEL + 5;
  if (frame < NO_SPACE) return null;
  return (
    <div
      style={{
        position: "absolute",
        ...MODAL,
        padding: "32px 32px 28px",
        background: "#22252b",
        border: "1px solid #4a2c2c",
        borderRadius: 20,
        boxShadow: "0 40px 100px rgba(0,0,0,0.7)",
        fontFamily: sans,
        color: "#eceef3",
        transform: `scale(${pop}) rotate(${buzz}deg)`,
        opacity: Math.min(1, pop * 2),
      }}
    >
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: "#3d1f1f", color: C.red, display: "grid", placeItems: "center", fontWeight: 800, fontSize: 32 }}>!</div>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>Espacio insuficiente</div>
          <div style={{ fontSize: 22, color: "#9aa0ad", marginTop: 4 }}>Libera 214 GB para seguir instalando.</div>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 30 }}>
        <div
          style={{
            height: 52,
            width: 160,
            borderRadius: 12,
            border: "1px solid #474b55",
            display: "grid",
            placeItems: "center",
            fontSize: 22,
            fontWeight: 600,
            background: pressed ? "#33363e" : undefined,
            transform: pressed ? "scale(0.95)" : undefined,
          }}
        >
          Cancelar
        </div>
        <div style={{ height: 52, padding: "0 26px", borderRadius: 12, background: "#7c5cff", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 700 }}>
          Liberar espacio
        </div>
      </div>
    </div>
  );
};

// The problem: a few cuts shouldn't need a 890 GB install.
export const Problem: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const win = spring({ frame, fps, config: { damping: 16, stiffness: 120 } });
  const note = spring({ frame: frame - 8, fps, config: { damping: 10, stiffness: 160 } });
  const gone = interpolate(frame, [CANCEL + 2, CANCEL + 14], [0, 1], { ...clamp, easing: Easing.in(Easing.cubic) });
  const caption = spring({ frame: frame - (CANCEL + 12), fps, config: { damping: 14, stiffness: 140 } });
  const strike = interpolate(frame, [CANCEL + 30, CANCEL + 40], [0, 1], ease);
  return (
    <AbsoluteFill>
      <Background />
      {gone < 1 && (
        <AbsoluteFill
          style={{
            opacity: Math.min(1, win * 1.5) * (1 - gone),
            transform: `translateY(${(1 - win) * 80}px) scale(${1 - 0.25 * gone})`,
            transformOrigin: "1190px 540px",
            filter: `blur(${gone * 10}px)`,
          }}
        >
          <Installer />
          <NoSpace />
        </AbsoluteFill>
      )}
      <PostIt style={{ left: 150, top: 300, transform: `rotate(${-5 + (1 - note) * -20}deg) scale(${note})`, opacity: Math.min(1, note * 2) }} />
      {caption > 0 && (
        <div
          style={{
            position: "absolute",
            left: 640,
            top: 360,
            fontFamily: sans,
            fontWeight: 800,
            fontSize: 92,
            lineHeight: 1.1,
            letterSpacing: -3,
            color: C.text,
            opacity: Math.min(1, caption * 2),
            transform: `translateY(${(1 - caption) * 40}px)`,
          }}
        >
          Cuatro recortes
          <br />
          no merecen{" "}
          <span style={{ position: "relative", color: C.red }}>
            890 GB
            <span style={{ position: "absolute", left: -6, top: "54%", height: 10, width: `calc(${strike * 100}% + 12px)`, background: C.red, borderRadius: 5 }} />
          </span>
          <span style={{ color: C.red }}>.</span>
        </div>
      )}
      {frame >= 92 && frame < CANCEL + 16 && (
        <Pointer
          path={[
            [92, 1880, 1020],
            [CANCEL - 6, ...CANCEL_BTN],
            [CANCEL + 16, CANCEL_BTN[0] + 40, CANCEL_BTN[1] + 60],
          ]}
          clicks={[CANCEL]}
        />
      )}
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
          Para cuatro recortes y tres fundidos.
        </div>
        <div style={{ marginTop: 6, fontFamily: sans, fontWeight: 600, fontSize: 58, color: C.accent, opacity: tag2, transform: `translateY(${(1 - tag2) * 24}px)` }}>
          Abre una pestaña y listo.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- the call to action

const TYPE_AT = 14;
const ENTER = TYPE_AT + SITE.length * 2 + 6;

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const brand = useSpring(0, { damping: 13 });
  const bar = spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 140 } });
  const typed = SITE.slice(0, Math.max(0, Math.min(SITE.length, Math.floor((frame - TYPE_AT) / 2) + 1)));
  const lit = interpolate(frame, [ENTER, ENTER + 8], [0, 1], clamp);
  const key = frame >= ENTER && frame < ENTER + 5;
  const note = spring({ frame: frame - (ENTER + 6), fps, config: { damping: 12, stiffness: 150 } });
  const foot = useSpring(ENTER + 50);
  const zeros = ["0 GB instalados", "0 cuentas", "0 archivos subidos"];
  return (
    <AbsoluteFill>
      <Background />
      <AbsoluteFill style={{ alignItems: "center" }}>
        <div style={{ marginTop: 250, opacity: brand, transform: `scale(${0.85 + 0.15 * brand})`, display: "flex", alignItems: "center", gap: 26 }}>
          <Mark size={80} />
          <Wordmark size={64} />
        </div>
        <div
          style={{
            marginTop: 70,
            width: 1160,
            height: 132,
            borderRadius: 66,
            background: C.panel,
            border: `2px solid ${lit > 0 ? C.accent : C.lineStrong}`,
            boxShadow: `0 30px 80px rgba(0,0,0,0.5), 0 0 ${80 * lit}px rgba(198,240,191,${0.35 * lit})`,
            display: "flex",
            alignItems: "center",
            gap: 30,
            padding: "0 30px 0 52px",
            boxSizing: "border-box",
            opacity: bar,
            transform: `translateY(${(1 - bar) * 40}px)`,
          }}
        >
          <svg width="34" height="40" viewBox="0 0 13 15" style={{ flex: "none" }}>
            <rect x="1" y="6" width="11" height="8" rx="2" fill={C.dim} />
            <path d="M3.5 6V4.5a3 3 0 0 1 6 0V6" stroke={C.dim} strokeWidth="1.6" fill="none" />
          </svg>
          <div style={{ flex: 1, fontFamily: sans, fontWeight: 700, fontSize: 80, letterSpacing: -2, color: lit > 0 ? C.accent : C.text, display: "flex", alignItems: "center" }}>
            {typed}
            {frame < ENTER + 4 && Math.floor(frame / 8) % 2 === 0 && <span style={{ width: 5, height: 78, background: C.accent, marginLeft: 6 }} />}
          </div>
          <div
            style={{
              height: 76,
              padding: "0 26px",
              borderRadius: 38,
              background: lit > 0 ? C.accent : C.selected,
              color: lit > 0 ? C.bg : C.soft,
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontFamily: sans,
              fontWeight: 700,
              fontSize: 30,
              transform: key ? "scale(0.92)" : undefined,
            }}
          >
            Intro ⏎
          </div>
        </div>
        <div style={{ marginTop: 50, display: "flex", gap: 18 }}>
          {zeros.map((z, i) => {
            const p = spring({ frame: frame - (ENTER + 30) - i * 6, fps, config: { damping: 13, stiffness: 180 } });
            return (
              <div
                key={z}
                style={{
                  fontFamily: sans,
                  fontWeight: 700,
                  fontSize: 32,
                  color: C.text,
                  padding: "14px 30px",
                  borderRadius: 999,
                  border: `1px solid ${C.lineStrong}`,
                  background: C.panel,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 30}px) scale(${0.8 + 0.2 * p})`,
                }}
              >
                <span style={{ color: C.accent }}>{z.split(" ")[0]}</span> {z.split(" ").slice(1).join(" ")}
              </div>
            );
          })}
        </div>
        <div style={{ position: "absolute", bottom: 56, fontFamily: sans, fontSize: 28, color: C.dim, opacity: foot }}>
          Recorta, funde y exporta. Luego cierra la pestaña.
        </div>
      </AbsoluteFill>
      <PostIt
        ticks={[ENTER + 16, ENTER + 24, ENTER + 32]}
        style={{ left: 1490, top: 640, transform: `rotate(6deg) scale(${0.85 * note})`, transformOrigin: "0 0", opacity: Math.min(1, note * 2) }}
      />
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
