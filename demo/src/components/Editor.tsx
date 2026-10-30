import React from "react";
import { Easing, interpolate, random, useCurrentFrame } from "remotion";
import {
  Check,
  Chevron,
  Close,
  Download,
  Expand,
  Eye,
  Frame,
  Gear,
  Grid,
  Link,
  Magnet,
  Next,
  Pause,
  Pencil,
  Pipette,
  Play,
  Plus,
  Prev,
  Redo,
  Scissors,
  SkipEnd,
  SkipStart,
  Speaker,
  TextIcon,
  Undo,
} from "./Icons";
import { Mark } from "./ui";
import { C, mono, sans, SITE } from "../theme";

// A copy of the editor at video.gimeno.dev, drawn at the app's own pixel sizes
// in a 1440×810 window and scaled up by the browser frame. The UI copy is the
// app's English dictionary (src/i18n/locales/en.ts); the project, files and
// footage are invented.

export const PAGE = { w: 1440, h: 810 };

type Box = { x: number; y: number; w: number; h: number };
export const MEDIA_BOX: Box = { x: 8, y: 60, w: 247, h: 365 };
export const PREVIEW_BOX: Box = { x: 264, y: 60, w: 871, h: 365 };
export const PROPS_BOX: Box = { x: 1144, y: 60, w: 288, h: 365 };
export const TL_BOX: Box = { x: 8, y: 434, w: 1424, h: 368 };

// Timeline geometry, in page pixels.
export const PX = 30;
const HEADS = 132;
export const tlX = (s: number) => TL_BOX.x + HEADS + 10 + s * PX;

export type TrackId = "T" | "V2" | "V1" | "A1" | "A2";
const TRACKS: { id: TrackId; name: string; sub?: string; h: number; icon: "eye" | "speaker" }[] = [
  { id: "T", name: "Text", h: 40, icon: "eye" },
  { id: "V2", name: "V2", sub: "Overlay", h: 54, icon: "eye" },
  { id: "V1", name: "V1", sub: "Main", h: 54, icon: "eye" },
  { id: "A1", name: "A1", sub: "Clip audio", h: 58, icon: "speaker" },
  { id: "A2", name: "A2", sub: "Overlay audio", h: 58, icon: "speaker" },
];
const RULER_TOP = TL_BOX.y + 46;
const TRACKS_TOP = RULER_TOP + 28;
const trackRow = (id: TrackId) => {
  let y = TRACKS_TOP;
  for (const t of TRACKS) {
    if (t.id === id) return { y, h: t.h };
    y += t.h;
  }
  throw new Error(id);
};
/** Page y of a track's middle. */
export const trackY = (id: TrackId) => {
  const r = trackRow(id);
  return r.y + r.h / 2;
};

export type Thumb = React.FC<{ t?: number }>;

export type Clip = {
  id: string;
  track: TrackId;
  start: number;
  dur: number;
  name: string;
  thumb?: Thumb;
  tone?: string;
  selected?: boolean;
  db?: string;
  /** 0..1 grow-in when the clip lands. */
  pop?: number;
};

export type Transition = { at: number; kind: "dissolve" | "fade"; pop?: number };

export type MediaItem = { id: string; name: string; meta: string; dur: string; thumb: Thumb; pop?: number; active?: boolean };

const fmt = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${String(m).padStart(2, "0")}:${sec.toFixed(2).padStart(5, "0")}`;
};

// ---------------------------------------------------------------- browser

export const Browser: React.FC<{ width: number; height: number; scale: number; url?: string; style?: React.CSSProperties; children: React.ReactNode }> = ({
  width,
  height,
  scale,
  url = "",
  style,
  children,
}) => (
  <div
    style={{
      position: "absolute",
      width,
      background: C.bg,
      border: `1px solid ${C.lineStrong}`,
      borderRadius: 18,
      boxShadow: "0 40px 120px rgba(0,0,0,0.6), 0 0 0 1px rgba(198,240,191,0.06), 0 0 80px rgba(198,240,191,0.08)",
      overflow: "hidden",
      ...style,
    }}
  >
    <div style={{ height: 46, display: "flex", alignItems: "center", padding: "0 18px", gap: 9, borderBottom: `1px solid ${C.line}`, background: "#121413" }}>
      {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
        <div key={c} style={{ width: 13, height: 13, borderRadius: 7, background: c, opacity: 0.85 }} />
      ))}
      <div style={{ flex: 1, display: "flex", justifyContent: "center", marginRight: 56 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "6px 22px",
            borderRadius: 999,
            background: C.bg,
            border: `1px solid ${C.line}`,
            fontFamily: mono,
            fontSize: 16,
            color: C.dim,
            minWidth: 380,
            justifyContent: "center",
          }}
        >
          <svg width="12" height="14" viewBox="0 0 13 15">
            <rect x="1" y="6" width="11" height="8" rx="2" fill={C.dim} />
            <path d="M3.5 6V4.5a3 3 0 0 1 6 0V6" stroke={C.dim} strokeWidth="1.6" fill="none" />
          </svg>
          <span>
            <span style={{ color: C.text }}>{SITE}</span>
            {url}
          </span>
        </div>
      </div>
    </div>
    <div style={{ height, overflow: "hidden", position: "relative" }}>
      <div style={{ width: width / scale, height: height / scale, transform: `scale(${scale})`, transformOrigin: "0 0", position: "relative" }}>{children}</div>
    </div>
  </div>
);

// ---------------------------------------------------------------- bits

const Btn: React.FC<{ children: React.ReactNode; h?: number; outlined?: boolean; style?: React.CSSProperties }> = ({ children, h = 30, outlined, style }) => (
  <div
    style={{
      height: h,
      padding: "0 10px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      borderRadius: h * 0.25,
      border: `1px solid ${outlined ? C.control : "transparent"}`,
      fontSize: 12,
      fontWeight: 500,
      color: C.text,
      boxSizing: "border-box",
      whiteSpace: "nowrap",
      ...style,
    }}
  >
    {children}
  </div>
);

const Panel: React.FC<{ box: Box; children: React.ReactNode; style?: React.CSSProperties }> = ({ box, children, style }) => (
  <div
    style={{
      position: "absolute",
      left: box.x,
      top: box.y,
      width: box.w,
      height: box.h,
      background: C.panel,
      border: `1px solid ${C.line}`,
      borderRadius: 14,
      overflow: "hidden",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      ...style,
    }}
  >
    {children}
  </div>
);

const Title: React.FC<{ children: React.ReactNode; count?: number }> = ({ children, count }) => (
  <span style={{ fontWeight: 700, letterSpacing: "-0.01em", fontSize: 13 }}>
    {children}
    {count !== undefined && <span style={{ marginLeft: 8, color: C.muted, fontWeight: 500 }}>{count}</span>}
  </span>
);

// ---------------------------------------------------------------- top bar

const TopBar: React.FC<{ clipCount: string; exportPressed?: boolean }> = ({ clipCount, exportPressed }) => (
  <div
    style={{
      position: "absolute",
      left: 0,
      right: 0,
      top: 0,
      height: 52,
      display: "flex",
      alignItems: "center",
      gap: 12,
      padding: "0 16px",
      borderBottom: `1px solid ${C.line}`,
      boxSizing: "border-box",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <Mark size={26} />
      <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.03em" }}>
        [Unnamed Video Editor]<span style={{ color: C.accent }}>.</span>
      </span>
    </div>
    <div style={{ width: 1, height: 22, background: C.control, margin: "0 2px" }} />
    <Btn outlined h={32} style={{ color: C.soft, fontSize: 13, gap: 7 }}>
      <Grid size={14} /> Projects
    </Btn>
    <span style={{ fontWeight: 500, fontSize: 13, display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
      Lisbon weekend <Pencil size={12} color={C.muted} />
    </span>
    <span style={{ color: C.muted, fontSize: 12, marginLeft: 8 }}>{clipCount}</span>
    <span style={{ color: C.muted, fontSize: 12 }}>Saved</span>
    <div style={{ flex: 1 }} />
    {[Undo, Redo, Expand, Gear].map((I, i) => (
      <div key={i} style={{ width: 34, height: 34, display: "grid", placeItems: "center", color: C.soft }}>
        <I size={16} />
      </div>
    ))}
    <div
      style={{
        height: 34,
        padding: "0 14px",
        borderRadius: 8.5,
        background: exportPressed ? "#e0f8db" : C.accent,
        color: C.bg,
        fontWeight: 600,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 8,
        transform: exportPressed ? "scale(0.95)" : undefined,
      }}
    >
      <Download size={15} /> Export
    </div>
  </div>
);

// ---------------------------------------------------------------- media

export type MediaTab = "media" | "transitions";

// Page centres of things in the media panel.
export const MEDIA_TAB: Record<MediaTab, [number, number]> = { media: [MEDIA_BOX.x + 48, MEDIA_BOX.y + 25], transitions: [MEDIA_BOX.x + 134, MEDIA_BOX.y + 25] };
export const mediaRow = (i: number): [number, number] => [MEDIA_BOX.x + 50, MEDIA_BOX.y + 102 + 31 + i * 64];
export const transitionCard = (i: number): [number, number] => [MEDIA_BOX.x + 66 + i * 114, MEDIA_BOX.y + 52 + 32];

const PanelTabs: React.FC<{ tabs: React.ReactNode[]; active: number; tall?: boolean; actions?: React.ReactNode }> = ({ tabs, active, tall, actions }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: tall ? "4px 8px 0 6px" : "0 6px",
      borderBottom: `1px solid ${C.line}`,
      flex: "none",
    }}
  >
    <div style={{ display: "flex", gap: 2 }}>
      {tabs.map((t, i) => (
        <div
          key={i}
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            gap: 6,
            height: tall ? 42 : 36,
            padding: "0 8px",
            fontSize: tall ? 13 : 12,
            fontWeight: tall ? 700 : 500,
            color: i === active ? C.bright : C.dim,
            whiteSpace: "nowrap",
          }}
        >
          {t}
          {i === active && <div style={{ position: "absolute", left: 8, right: 8, bottom: -1, height: 2, borderRadius: 1, background: C.accent }} />}
        </div>
      ))}
    </div>
    {actions}
  </div>
);

const Count: React.FC<{ n: number }> = ({ n }) => <span style={{ fontSize: 11, color: C.muted, fontWeight: 500 }}>{n}</span>;

const TRANSITION_CARDS = [
  ["dissolve", "Cross dissolve", "linear-gradient(90deg, #35503f, #4a6a8a)"],
  ["fade", "Fade to black", "linear-gradient(90deg, #35503f, #0d0f0e)"],
] as const;

const MediaPanel: React.FC<{ media: MediaItem[]; tab: MediaTab; drop?: number; lift?: "dissolve" | "fade" }> = ({ media, tab, drop = 0, lift }) => (
  <Panel box={MEDIA_BOX}>
    <PanelTabs
      tall
      active={tab === "media" ? 0 : 1}
      tabs={[
        <>
          Media <Count n={media.filter((m) => (m.pop ?? 1) > 0).length} />
        </>,
        <>
          Transitions <Count n={2} />
        </>,
      ]}
      actions={
        <Btn outlined style={{ width: 30, padding: 0 }}>
          <Plus size={14} />
        </Btn>
      }
    />
    {tab === "media" ? (
      <>
        <div style={{ padding: "10px 16px 10px", fontSize: 12, color: C.muted, lineHeight: 1.4, flex: "none" }}>
          Import links originals. Dropped files need reconnecting after reload.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, padding: "0 6px 8px", flex: 1, overflow: "hidden" }}>
          {media.map((m) => {
            const p = m.pop ?? 1;
            if (p <= 0) return null;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  height: 60,
                  flex: "none",
                  padding: "0 8px",
                  borderRadius: 10,
                  opacity: Math.min(1, p * 1.5),
                  transform: `translateX(${(1 - p) * -24}px)`,
                  background: m.active ? "rgba(198,240,191,0.08)" : undefined,
                  boxShadow: m.active ? "inset 0 0 0 1px rgba(198,240,191,0.35)" : undefined,
                }}
              >
                <div style={{ position: "relative", width: 72, height: 42, borderRadius: 10.5, overflow: "hidden", flex: "none", background: "#000" }}>
                  <m.thumb t={40} />
                  <span
                    style={{ position: "absolute", right: 4, bottom: 3, font: `500 10px ${mono}`, background: "rgba(0,0,0,0.6)", color: C.text, padding: "1px 4px", borderRadius: 4 }}
                  >
                    {m.dur}
                  </span>
                </div>
                <div style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</span>
                  <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.meta}</span>
                  <span style={{ fontSize: 11, color: C.muted, lineHeight: 1.3 }}>Linked original</span>
                </div>
              </div>
            );
          })}
        </div>
      </>
    ) : (
      <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "6px 12px 14px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {TRANSITION_CARDS.map(([k, name, bg]) => (
            <div
              key={k}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                padding: 6,
                borderRadius: 10,
                border: `1px solid ${lift === k ? C.accent : C.control}`,
                background: C.bg,
                opacity: lift === k ? 0.55 : 1,
                fontSize: 12,
                fontWeight: 500,
              }}
            >
              <div style={{ height: 28, borderRadius: 4, background: bg }} />
              {name}
            </div>
          ))}
        </div>
        <span style={{ fontSize: 12, color: C.muted, lineHeight: 1.4 }}>Overlap two clips, then drag a transition onto their overlap.</span>
      </div>
    )}
    {drop > 0 && (
      <div
        style={{
          position: "absolute",
          inset: 6,
          zIndex: 5,
          border: `1px dashed ${C.accent}`,
          borderRadius: 10,
          background: "rgba(198,240,191,0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.accent,
          fontSize: 12,
          fontWeight: 500,
          opacity: drop,
        }}
      >
        Drop to import
      </div>
    )}
  </Panel>
);

// ---------------------------------------------------------------- preview

// The stage's largest size inside the preview panel.
const STAGE_MAX = { w: 839, h: 236 };
export const stageSize = (ratio: number) => {
  const w = Math.min(STAGE_MAX.w, STAGE_MAX.h * ratio);
  return { w, h: w / ratio };
};
/** Page centre of the preview stage. */
export const STAGE_CENTER: [number, number] = [PREVIEW_BOX.x + PREVIEW_BOX.w / 2, PREVIEW_BOX.y + 44 + 132];

const PreviewPanel: React.FC<{
  stage: React.ReactNode;
  ratio: number;
  aspect: string;
  aspectOpen?: boolean;
  playhead: number;
  total: number;
  playing?: boolean;
  stageOverlay?: React.ReactNode;
}> = ({ stage, ratio, aspect, aspectOpen, playhead, total, playing, stageOverlay }) => {
  const s = stageSize(ratio);
  return (
    <Panel box={PREVIEW_BOX}>
      <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 14px", flex: "none" }}>
        <Title>Preview</Title>
        <div
          style={{
            height: 26,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 8px 0 10px",
            borderRadius: 6.5,
            border: `1px solid ${aspectOpen ? C.accent : C.control}`,
            color: C.muted,
            fontSize: 12,
          }}
        >
          <span>{aspect.split(" ")[0]}</span>
          <span style={{ fontFamily: mono, fontSize: 11 }}>{aspect.split(" ")[1]}</span>
          <Chevron size={12} />
        </div>
      </div>
      <div style={{ flex: 1, position: "relative", background: C.inset, borderTop: `1px solid ${C.line}` }}>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            width: s.w,
            height: s.h,
            transform: "translate(-50%, -50%)",
            borderRadius: 8,
            overflow: "hidden",
            background: "#000",
            containerType: "size",
            fontFamily: sans,
          }}
        >
          {stage}
          {stageOverlay}
        </div>
      </div>
      <div style={{ height: 56, flex: "none", display: "flex", alignItems: "center", padding: "0 14px", borderTop: `1px solid ${C.line}`, position: "relative" }}>
        <span style={{ fontFamily: mono, fontSize: 12, color: C.text }}>
          {fmt(playhead)} <span style={{ color: C.muted }}>/ {fmt(total)}</span>
        </span>
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10, color: C.soft }}>
          <SkipStart size={15} />
          <Prev size={15} />
          <div style={{ width: 40, height: 40, borderRadius: 20, background: C.accent, display: "grid", placeItems: "center", color: C.bg }}>
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </div>
          <Next size={15} />
          <SkipEnd size={15} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12, color: C.soft }}>
          <Speaker size={15} />
          <div style={{ width: 90, height: 22, borderRadius: 5.5, background: C.inset, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", inset: "0 30% 0 0", background: "#2d3a30" }} />
            <span style={{ position: "absolute", right: 6, top: 4, fontFamily: mono, fontSize: 10, color: C.text }}>70%</span>
          </div>
          <Expand size={15} />
        </div>
      </div>
    </Panel>
  );
};

// ---------------------------------------------------------------- properties

const PropsPanel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <Panel box={PROPS_BOX}>
    <div style={{ height: 44, display: "flex", alignItems: "center", padding: "0 14px", borderBottom: `1px solid ${C.line}`, flex: "none" }}>
      <Title>{title}</Title>
    </div>
    <div style={{ flex: 1, overflow: "hidden" }}>{children}</div>
  </Panel>
);

export type PropsTab = "transform" | "key";
const PROPS_TABS = ["Transform", "Crop", "Key", "Timing", "Info"];
// Page centres of the video clip's tabs and of the key's Pick button.
export const PROPS_TAB: Record<PropsTab, [number, number]> = { transform: [PROPS_BOX.x + 42, PROPS_BOX.y + 124], key: [PROPS_BOX.x + 135, PROPS_BOX.y + 124] };
export const PICK_BUTTON: [number, number] = [PROPS_BOX.x + PROPS_BOX.w - 48, PROPS_BOX.y + 207];

const ClipHeader: React.FC<{ thumb: Thumb; name: string; start: string }> = ({ thumb: T, name, start }) => (
  <div style={{ display: "flex", gap: 10, alignItems: "center", padding: 14, height: 62, boxSizing: "border-box" }}>
    <div style={{ width: 56, height: 34, borderRadius: 8.5, position: "relative", overflow: "hidden", flex: "none" }}>
      <T t={60} />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 500 }}>{name}</span>
      <span style={{ fontSize: 11, color: C.muted }}>Starts at {start} on the timeline</span>
    </div>
  </div>
);

export type KeyState = { on: boolean; picking?: boolean; color?: string };

/** The video clip inspector: clip header, tabs, then the open tab. */
export const VideoProps: React.FC<{ thumb: Thumb; name: string; start: string; tab?: PropsTab; keyState?: KeyState }> = ({
  thumb,
  name,
  start,
  tab = "transform",
  keyState = { on: false },
}) => (
  <>
    <ClipHeader thumb={thumb} name={name} start={start} />
    <PanelTabs
      active={tab === "transform" ? 0 : 2}
      tabs={PROPS_TABS.map((t) =>
        t === "Key" && keyState.on ? (
          <>
            Key <span style={{ width: 6, height: 6, borderRadius: 3, background: C.accent }} />
          </>
        ) : (
          t
        ),
      )}
    />
    {tab === "transform" ? <TransformBody /> : <KeyBody {...keyState} />}
  </>
);

const Section: React.FC<{ label: string; right?: React.ReactNode; children: React.ReactNode }> = ({ label, right, children }) => (
  <div style={{ padding: "12px 14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", height: 26 }}>
      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: C.dim }}>{label}</span>
      {right}
    </div>
    {children}
  </div>
);

const SliderRow: React.FC<{ label: string; value: string; fill: number }> = ({ label, value, fill }) => (
  <div
    style={{
      height: 34,
      borderRadius: 8.5,
      background: C.inset,
      position: "relative",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 11px",
      fontSize: 12,
    }}
  >
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${fill * 100}%`, background: "#2a332c", borderRight: `2px solid ${C.accent}` }} />
    <span style={{ position: "relative", color: C.soft }}>{label}</span>
    <span style={{ position: "relative", fontFamily: mono, fontSize: 12 }}>{value}</span>
  </div>
);

const TransformBody: React.FC = () => (
  <Section label="POSITION & SCALE" right={<span style={{ fontSize: 11, color: C.dim }}>Reset</span>}>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, padding: 3, background: C.inset, border: `1px solid ${C.control}`, borderRadius: 9 }}>
      {["Fit", "Fill", "Custom"].map((l, i) => (
        <div key={l} style={{ height: 28, borderRadius: 6, display: "grid", placeItems: "center", fontSize: 12, background: i === 0 ? C.selected : undefined, color: i === 0 ? C.bright : C.dim }}>
          {l}
        </div>
      ))}
    </div>
    <SliderRow label="Scale" value="100%" fill={0.27} />
    <SliderRow label="Rotation" value="0°" fill={0.5} />
  </Section>
);

// The app's defaults (NO_KEY in src/editor/model.ts).
const KeyBody: React.FC<KeyState> = ({ on, picking, color = "#00B140" }) => (
  <Section
    label="KEY"
    right={
      <Btn outlined h={26} style={{ fontSize: 11, padding: "0 9px", color: on ? C.accent : C.dim }}>
        {on ? "On" : "Off"}
      </Btn>
    }
  >
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <div style={{ width: 30, height: 30, borderRadius: 7.5, background: color, border: `1px solid ${C.control}`, flex: "none", boxSizing: "border-box" }} />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          height: 30,
          borderRadius: 7.5,
          background: C.inset,
          border: `1px solid ${C.control}`,
          fontFamily: mono,
          fontSize: 12,
          display: "flex",
          alignItems: "center",
          padding: "0 10px",
          boxSizing: "border-box",
        }}
      >
        {color.toUpperCase()}
      </div>
      <Btn outlined style={{ flex: "none", color: picking ? C.accent : C.soft }}>
        <Pipette size={13} /> {picking ? "Picking…" : "Pick"}
      </Btn>
    </div>
    <SliderRow label="Tolerance" value="25%" fill={0.25} />
    <SliderRow label="Softness" value="20%" fill={0.2} />
    <SliderRow label="Spill" value="50%" fill={0.5} />
  </Section>
);

// ---------------------------------------------------------------- timeline

const Waveform: React.FC<{ id: string; width: number; height: number }> = ({ id, width, height }) => {
  const n = Math.floor(width / 3);
  return (
    <svg width={width} height={height} style={{ position: "absolute", left: 0, top: 0 }}>
      {Array.from({ length: n }, (_, i) => {
        const env = 0.45 + 0.55 * Math.abs(Math.sin(i / 7 + random(id) * 9));
        const h = Math.max(2, height * 0.62 * env * (0.35 + 0.65 * random(`${id}${i}`)));
        return <rect key={i} x={i * 3 + 1} y={height / 2 - h / 2} width={1.6} height={h} rx={0.8} fill={C.accent} opacity={0.5} />;
      })}
    </svg>
  );
};

const ClipView: React.FC<{ clip: Clip }> = ({ clip }) => {
  const { y, h } = trackRow(clip.track);
  const pop = clip.pop ?? 1;
  if (pop <= 0) return null;
  const left = tlX(clip.start);
  const width = clip.dur * PX - 2;
  const top = y + 6;
  const height = h - 12;
  const r = height * 0.25;
  const text = clip.track === "T";
  const audio = clip.track === "A1" || clip.track === "A2";
  const label = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 6,
        padding: "4px 10px",
        fontSize: 11,
        fontWeight: 500,
        color: C.bright,
        background: text || audio ? undefined : "rgba(0,0,0,0.38)",
        whiteSpace: "nowrap",
        position: "relative",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden" }}>
        {text ? <TextIcon size={11} /> : !audio && <Link size={10} />}
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{clip.name}</span>
      </span>
      {!audio && <span style={{ fontFamily: mono, color: "#d8ded9", flex: "none" }}>{clip.dur.toFixed(1)}s</span>}
    </div>
  );
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        width,
        height,
        borderRadius: r,
        overflow: "hidden",
        transform: `scaleY(${0.4 + 0.6 * pop})`,
        opacity: Math.min(1, pop * 2),
        background: text ? "#2f3f34" : audio ? "#1c2a21" : clip.tone ?? "#2c4756",
        boxShadow: clip.selected
          ? `0 0 0 2px ${C.accent}`
          : text
            ? "inset 0 0 0 1px #5a7a62"
            : audio
              ? "inset 0 0 0 1px rgba(198,240,191,0.22)"
              : "inset 0 0 0 1px rgba(255,255,255,0.08)",
        display: "flex",
        flexDirection: "column",
        justifyContent: text ? "center" : undefined,
      }}
    >
      {audio && (
        <>
          <Waveform id={clip.id} width={width} height={height} />
          <div style={{ position: "absolute", left: 0, right: 0, top: height * 0.22, height: 1.5, background: C.accent, opacity: 0.8 }} />
          <span style={{ position: "absolute", right: 8, bottom: 3, fontFamily: mono, fontSize: 10, color: "#d8ded9" }}>{clip.db ?? "0.0 dB"}</span>
        </>
      )}
      {!text && !audio && clip.thumb && (
        <div style={{ position: "absolute", inset: 0, display: "flex", opacity: 0.6 }}>
          {Array.from({ length: Math.ceil(width / 56) }, (_, i) => (
            <div key={i} style={{ width: 56, height: "100%", position: "relative", flex: "none", borderRight: "1px solid rgba(0,0,0,0.25)" }}>
              {clip.thumb && <clip.thumb t={i * 25} />}
            </div>
          ))}
        </div>
      )}
      {!audio && label}
      {clip.selected && !audio && (
        <>
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 7, background: C.accent }} />
          <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 7, background: C.accent }} />
        </>
      )}
    </div>
  );
};

const TransitionBadge: React.FC<{ t: Transition }> = ({ t }) => {
  const pop = t.pop ?? 1;
  if (pop <= 0) return null;
  const x = tlX(t.at);
  const y = trackY("V1");
  return (
    <>
      <div
        style={{
          position: "absolute",
          left: x - 15,
          top: trackRow("V1").y + 6,
          width: 30,
          height: trackRow("V1").h - 12,
          background: "repeating-linear-gradient(135deg, rgba(198,240,191,0.35) 0 3px, transparent 3px 7px)",
          opacity: pop,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: 20,
          height: 20,
          transform: `translate(-50%, -50%) scale(${pop})`,
          borderRadius: 5,
          background: C.inset,
          border: `1.5px solid ${C.accent}`,
          display: "grid",
          placeItems: "center",
          zIndex: 4,
        }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          {t.kind === "dissolve" ? (
            <>
              <circle cx="4.5" cy="6" r="3.3" fill="none" stroke={C.accent} strokeWidth="1.3" />
              <circle cx="7.5" cy="6" r="3.3" fill="none" stroke={C.accent} strokeWidth="1.3" />
            </>
          ) : (
            <rect x="2" y="2" width="8" height="8" rx="1.5" fill="none" stroke={C.accent} strokeWidth="1.3" />
          )}
        </svg>
      </div>
    </>
  );
};

const TimelinePanel: React.FC<{ clips: Clip[]; transitions: Transition[]; playhead: number; split?: boolean; cutFlash?: { at: number; p: number } }> = ({
  clips,
  transitions,
  playhead,
  split,
  cutFlash,
}) => {
  const right = TL_BOX.x + TL_BOX.w;
  const seconds = Math.ceil((right - tlX(0)) / PX);
  return (
    <>
      <Panel box={TL_BOX}>
        <div style={{ height: 46, display: "flex", alignItems: "center", gap: 8, padding: "0 10px", borderBottom: `1px solid ${C.line}`, flex: "none" }}>
          <div style={{ display: "flex", gap: 2, padding: 3, background: C.inset, border: `1px solid ${C.control}`, borderRadius: 9.5 }}>
            {(
              [
                ["Split", "S", Scissors, split],
                ["Text", "T", TextIcon, false],
              ] as const
            ).map(([l, k, I, on]) => (
              <div
                key={l}
                style={{
                  height: 30,
                  padding: "0 10px",
                  borderRadius: 6.5,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12,
                  fontWeight: 500,
                  background: on ? C.selected : undefined,
                  color: on ? C.accent : C.soft,
                }}
              >
                <I size={13} /> {l} <span style={{ fontSize: 10, color: C.muted }}>{k}</span>
              </div>
            ))}
            <div style={{ width: 1, background: C.control, margin: "4px 5px" }} />
            <div style={{ width: 34, height: 30, borderRadius: 6.5, background: C.selected, display: "grid", placeItems: "center", color: C.accent }}>
              <Magnet size={14} />
            </div>
          </div>
          {split && <span style={{ fontSize: 12, color: C.muted, marginLeft: 6 }}>Click a clip to cut it · Cuts snap to the playhead · Esc to stop splitting</span>}
          <div style={{ flex: 1 }} />
          <Btn outlined>
            <Plus size={13} /> Video track
          </Btn>
          <Btn outlined>
            <Plus size={13} /> Audio track
          </Btn>
          <Btn outlined>Fit</Btn>
        </div>
        <div style={{ position: "absolute", left: HEADS, top: 46, bottom: 0, width: 1, background: C.line }} />
        <div style={{ position: "absolute", left: 0, top: 46 + 28, width: HEADS }}>
          {TRACKS.map((t) => (
            <div key={t.id} style={{ height: t.h, display: "flex", alignItems: "center", padding: "0 10px 0 12px", borderBottom: `1px solid ${C.line}`, boxSizing: "border-box" }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#e4e9e5" }}>{t.name}</span>
                {t.sub && <span style={{ fontSize: 10, color: C.muted }}>{t.sub}</span>}
              </div>
              <span style={{ color: C.muted }}>{t.icon === "eye" ? <Eye size={13} /> : <Speaker size={13} />}</span>
            </div>
          ))}
        </div>
        <div style={{ position: "absolute", left: HEADS + 1, right: 0, top: 46, height: 28, borderBottom: `1px solid ${C.line}` }} />
      </Panel>
      {Array.from({ length: seconds }, (_, s) => (
        <div key={s} style={{ position: "absolute", left: tlX(s), top: RULER_TOP + (s % 5 === 0 ? 6 : 18), width: 1, height: s % 5 === 0 ? 21 : 9, background: C.control }}>
          {s % 5 === 0 && (
            <span style={{ position: "absolute", left: 4, top: -2, fontFamily: mono, fontSize: 10, color: C.muted, whiteSpace: "nowrap" }}>{fmt(s).slice(0, 5)}</span>
          )}
        </div>
      ))}
      {TRACKS.map((t) => (
        <div key={t.id} style={{ position: "absolute", left: TL_BOX.x + HEADS + 1, right: PAGE.w - right + 1, top: trackRow(t.id).y + t.h - 1, height: 1, background: C.line }} />
      ))}
      {clips.map((c) => (
        <ClipView key={c.id} clip={c} />
      ))}
      {transitions.map((t, i) => (
        <TransitionBadge key={i} t={t} />
      ))}
      {cutFlash && cutFlash.p < 1 && (
        <div
          style={{
            position: "absolute",
            left: tlX(cutFlash.at) - 1,
            top: TRACKS_TOP,
            width: 2,
            height: trackRow("A1").y + trackRow("A1").h - TRACKS_TOP,
            background: C.accent,
            boxShadow: `0 0 ${18 * (1 - cutFlash.p)}px ${C.accent}`,
            opacity: 1 - cutFlash.p,
            zIndex: 6,
          }}
        />
      )}
      <div style={{ position: "absolute", left: tlX(playhead) - 1, top: RULER_TOP, width: 2, height: TL_BOX.y + TL_BOX.h - RULER_TOP - 2, background: C.bright, zIndex: 7 }}>
        <div style={{ position: "absolute", top: 0, left: -5, width: 12, height: 12, borderRadius: "3px 3px 6px 6px", background: C.bright }} />
      </div>
    </>
  );
};

// ---------------------------------------------------------------- menus & dialogs

export const ASPECTS: [string, string, number][] = [
  ["16:9", "Landscape · YouTube", 16 / 9],
  ["9:16", "Vertical · Shorts, Reels, TikTok", 9 / 16],
  ["1:1", "Square", 1],
  ["4:5", "Portrait · feed posts", 4 / 5],
  ["4:3", "Classic", 4 / 3],
  ["21:9", "Cinema widescreen", 21 / 9],
];
// Option rows in the open aspect menu, by page y.
export const ASPECT_ROW_Y = (i: number) => 137 + i * 41;
export const ASPECT_PILL: [number, number] = [PREVIEW_BOX.x + PREVIEW_BOX.w - 70, PREVIEW_BOX.y + 22];

export const AspectMenu: React.FC<{ hover: number; selected: number; open: number }> = ({ hover, selected, open }) => {
  if (open <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        right: PAGE.w - (PREVIEW_BOX.x + PREVIEW_BOX.w) + 14,
        top: 103,
        width: 264,
        padding: 5,
        background: C.surface,
        border: `1px solid ${C.lineStrong}`,
        borderRadius: 12,
        boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
        zIndex: 12,
        opacity: open,
        transform: `translateY(${(1 - open) * -6}px)`,
        transformOrigin: "top right",
      }}
    >
      <div style={{ padding: "6px 10px 6px", fontSize: 11, color: C.muted }}>Output frame · export keeps this shape</div>
      {ASPECTS.map(([r, use, ratio], i) => (
        <div
          key={r}
          style={{
            height: 41,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 10px",
            borderRadius: 8,
            background: i === hover ? C.hover : undefined,
            boxSizing: "border-box",
          }}
        >
          <span style={{ color: C.dim }}>
            <Frame size={16} ratio={ratio} />
          </span>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 12 }}>{r}</span>
            <span style={{ fontSize: 10.5, color: C.muted }}>{use}</span>
          </div>
          {i === selected && <Check size={13} color={C.accent} />}
        </div>
      ))}
    </div>
  );
};

const DialogRow: React.FC<{ k: string; v: string; m?: boolean }> = ({ k, v, m }) => (
  <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", borderTop: `1px solid ${C.line}`, fontSize: 13 }}>
    <span style={{ color: C.soft }}>{k}</span>
    <span style={{ fontWeight: 600, fontFamily: m ? mono : undefined }}>{v}</span>
  </div>
);

const Stage: React.FC<{ label: string; note: string; status: "done" | "active" | "wait" }> = ({ label, note, status }) => {
  const frame = useCurrentFrame();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: status === "wait" ? C.muted : C.text }}>
      <div
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          display: "grid",
          placeItems: "center",
          background: status === "done" ? C.accent : "transparent",
          border: status === "done" ? undefined : `1.5px solid ${status === "active" ? C.accent : C.control}`,
          boxSizing: "border-box",
        }}
      >
        {status === "done" && <Check size={11} color={C.bg} />}
        {status === "active" && (
          <div style={{ width: 8, height: 8, borderRadius: 4, background: C.accent, opacity: 0.5 + 0.5 * Math.sin(frame / 3) }} />
        )}
      </div>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ fontFamily: mono, fontSize: 11, color: C.muted }}>{note}</span>
    </div>
  );
};

export const EXPORT_BOX = { x: 460, y: 120, w: 520 };
const FRAMES = 1050;

export const ExportDialog: React.FC<{ step: "settings" | "rendering" | "done"; progress?: number; pressed?: "start" | "download"; show: number }> = ({
  step,
  progress = 0,
  pressed,
  show,
}) => {
  if (show <= 0) return null;
  const primary = (label: React.ReactNode, on: boolean) => (
    <div
      style={{
        height: 40,
        padding: "0 16px",
        borderRadius: 10,
        background: on ? "#e0f8db" : C.accent,
        color: C.bg,
        fontWeight: 700,
        fontSize: 13,
        display: "flex",
        alignItems: "center",
        gap: 8,
        transform: on ? "scale(0.95)" : undefined,
      }}
    >
      {label}
    </div>
  );
  const ghost = (label: string) => (
    <div style={{ height: 40, padding: "0 16px", borderRadius: 10, border: `1px solid ${C.control}`, fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center" }}>
      {label}
    </div>
  );
  const done = Math.round(progress * FRAMES);
  const phase = progress < 0.06 ? 0 : progress < 0.97 ? 1 : 2;
  const st = (i: number) => (i < phase ? "done" : i === phase ? "active" : "wait") as "done" | "active" | "wait";
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 15 }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(8,10,9,0.6)", opacity: show }} />
      <div
        style={{
          position: "absolute",
          left: EXPORT_BOX.x,
          top: EXPORT_BOX.y,
          width: EXPORT_BOX.w,
          background: C.surface,
          border: `1px solid ${C.lineStrong}`,
          borderRadius: 16,
          boxShadow: "0 24px 64px rgba(0,0,0,0.5)",
          overflow: "hidden",
          opacity: show,
          transform: `translateY(${(1 - show) * 20}px) scale(${0.96 + 0.04 * show})`,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", padding: "24px 24px 0" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em" }}>
              {step === "done" ? "Your video is ready" : step === "rendering" ? "Rendering" : "Export video"}
              <span style={{ color: C.accent }}>.</span>
            </div>
            <div style={{ color: C.dim, fontSize: 13, marginTop: 6 }}>
              {step === "done"
                ? "Saved in memory — download it before closing the tab."
                : step === "rendering"
                  ? "Encoding frames and mixing audio locally."
                  : "Rendered on this device. Nothing is uploaded."}
            </div>
          </div>
          <span style={{ color: C.dim }}>
            <Close size={16} />
          </span>
        </div>
        {step === "settings" && (
          <div style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, padding: 3, background: C.bg, border: `1px solid ${C.control}`, borderRadius: 10 }}>
              {[
                ["720p", "1280×720"],
                ["1080p", "1920×1080"],
              ].map(([a, b], i) => (
                <div key={a} style={{ padding: "7px 0", borderRadius: 7, textAlign: "center", background: i === 1 ? C.selected : undefined, color: i === 1 ? C.bright : C.dim }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{a}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>{b}</div>
                </div>
              ))}
            </div>
            <div style={{ border: `1px solid ${C.control}`, borderRadius: 10, overflow: "hidden", background: C.inset }}>
              <div style={{ marginTop: -1 }}>
                <DialogRow k="Format" v="MP4 · H.264 + AAC" />
                <DialogRow k="Frame rate" v="30 fps" />
                <DialogRow k="Duration" v="00:35.00" m />
                <DialogRow k="Frames" v={String(FRAMES)} m />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              {ghost("Cancel")}
              {primary("Start export", pressed === "start")}
            </div>
          </div>
        )}
        {step === "rendering" && (
          <div style={{ padding: "24px 24px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
              <span style={{ fontWeight: 700, fontFamily: mono }}>{Math.floor(progress * 100)}%</span>
              <span style={{ fontFamily: mono, color: C.muted, fontSize: 12 }}>
                frame {done} / {FRAMES}
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 4, background: "#2c352f", overflow: "hidden" }}>
              <div style={{ width: `${progress * 100}%`, height: "100%", background: C.accent, borderRadius: 4 }} />
            </div>
            <Stage label="Mixing audio" note="48 kHz stereo" status={st(0)} />
            <Stage label="Composing and encoding frames" note={`${done} / ${FRAMES}`} status={st(1)} />
            <Stage label="Writing MP4" note={phase === 2 ? "finishing" : "—"} status={st(2)} />
            <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: 4 }}>{ghost("Cancel export")}</div>
          </div>
        )}
        {step === "done" && (
          <div style={{ padding: "22px 24px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center", padding: 14, border: `1px solid ${C.control}`, borderRadius: 12, background: C.inset }}>
              <div style={{ width: 72, height: 42, borderRadius: 10, background: "#35503F", display: "grid", placeItems: "center", color: C.accent }}>
                <Play size={16} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 14 }}>lisbon-weekend-1080p.mp4</span>
                <span style={{ fontSize: 12, color: C.muted }}>1920×1080 · 00:35.00 · 41.6 MB · H.264 + AAC</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: C.accent, fontSize: 13 }}>Export again</span>
              <div style={{ display: "flex", gap: 8 }}>
                {ghost("Back to editor")}
                {primary(
                  <>
                    <Download size={15} /> Download
                  </>,
                  pressed === "download",
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------- the app

export type EditorProps = {
  media: MediaItem[];
  mediaTab?: MediaTab;
  mediaDrop?: number;
  lift?: "dissolve" | "fade";
  clips: Clip[];
  transitions?: Transition[];
  cutFlash?: { at: number; p: number };
  playhead: number;
  playing?: boolean;
  split?: boolean;
  stage: React.ReactNode;
  stageOverlay?: React.ReactNode;
  ratio?: number;
  aspect?: string;
  aspectOpen?: boolean;
  propsTitle: string;
  props: React.ReactNode;
  exportPressed?: boolean;
  children?: React.ReactNode;
};

export const Editor: React.FC<EditorProps> = ({
  media,
  mediaTab = "media",
  mediaDrop,
  lift,
  clips,
  transitions = [],
  cutFlash,
  playhead,
  playing,
  split,
  stage,
  stageOverlay,
  ratio = 16 / 9,
  aspect = "16:9 1920×1080",
  aspectOpen,
  propsTitle,
  props,
  exportPressed,
  children,
}) => {
  const placed = clips.filter((c) => (c.pop ?? 1) > 0);
  const visible = placed.filter((c) => c.track !== "A1" && c.track !== "A2");
  const end = Math.max(0, ...placed.map((c) => c.start + c.dur));
  return (
    <div style={{ position: "absolute", inset: 0, background: C.bg, color: C.text, fontFamily: sans, fontSize: 13, lineHeight: 1.4 }}>
      <TopBar clipCount={`${visible.length} ${visible.length === 1 ? "clip" : "clips"} · ${fmt(end)}`} exportPressed={exportPressed} />
      <MediaPanel media={media} tab={mediaTab} drop={mediaDrop} lift={lift} />
      <PreviewPanel
        stage={stage}
        stageOverlay={stageOverlay}
        ratio={ratio}
        aspect={aspect}
        aspectOpen={aspectOpen}
        playhead={playhead}
        total={end}
        playing={playing}
      />
      <PropsPanel title={propsTitle}>{props}</PropsPanel>
      <TimelinePanel clips={clips} transitions={transitions} playhead={playhead} split={split} cutFlash={cutFlash} />
      {children}
    </div>
  );
};

// A mouse pointer that follows `path` ([frame, x, y] keys, in page pixels)
// and dips on each click frame.
export const Pointer: React.FC<{ path: [number, number, number][]; clicks?: number[] }> = ({ path, clicks = [] }) => {
  const frame = useCurrentFrame();
  const opt = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: Easing.inOut(Easing.cubic) };
  const x = interpolate(frame, path.map((p) => p[0]), path.map((p) => p[1]), opt);
  const y = interpolate(frame, path.map((p) => p[0]), path.map((p) => p[2]), opt);
  const last = clicks.filter((c) => frame >= c).pop();
  const t = last === undefined ? 99 : frame - last;
  const press = t < 6 ? 1 - Math.sin((t / 6) * Math.PI) * 0.18 : 1;
  const ring = t < 14 ? t / 14 : 0;
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 50, pointerEvents: "none" }}>
      {ring > 0 && (
        <div
          style={{
            position: "absolute",
            left: -18 * (0.4 + ring),
            top: -18 * (0.4 + ring),
            width: 36 * (0.4 + ring),
            height: 36 * (0.4 + ring),
            borderRadius: "50%",
            border: `2px solid ${C.accent}`,
            opacity: 1 - ring,
          }}
        />
      )}
      <svg width="20" height="26" viewBox="0 0 20 26" style={{ transform: `scale(${press})`, transformOrigin: "0 0", filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.5))" }}>
        <path d="M1 1v20l5.2-4.6 3.4 7.8 3.4-1.5-3.3-7.6H17L1 1Z" fill="white" stroke="#111" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** Interpolates a pointer path at the current frame, for things that ride along with it. */
export const pathAt = (frame: number, path: [number, number, number][]): [number, number] => {
  const opt = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const, easing: Easing.inOut(Easing.cubic) };
  return [interpolate(frame, path.map((p) => p[0]), path.map((p) => p[1]), opt), interpolate(frame, path.map((p) => p[0]), path.map((p) => p[2]), opt)];
};
