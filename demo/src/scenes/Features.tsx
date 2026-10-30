import React from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from "remotion";
import {
  ASPECT_PILL,
  ASPECT_ROW_Y,
  AspectMenu,
  ASPECTS,
  Browser,
  Clip,
  Editor,
  ExportDialog,
  KeyProps,
  MEDIA_BOX,
  MediaItem,
  PAGE,
  pathAt,
  Pointer,
  PROPS_BOX,
  STAGE_CENTER,
  stageSize,
  TL_BOX,
  tlX,
  TransformProps,
  trackY,
} from "../components/Editor";
import { Beach, Coast, Host, Title } from "../components/Footage";
import { Background, BigWord, Callout, Camera, Rise } from "../components/ui";
import { baseClips, MEDIA, pair, thumbOf, TONES } from "../project";
import { C, mono } from "../theme";

// Frames the big word holds the stage before the browser rises in.
const IN = 20;

// The browser window, and the editor it shows at the app's own pixel sizes.
const WIN = { left: 204, top: 160, scale: 1.05 };
// Converts a page point into a frame point, for camera origins.
const screen = (x: number, y: number): [number, number] => [WIN.left + x * WIN.scale, WIN.top + 46 + y * WIN.scale];

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = { ...clamp, easing: Easing.inOut(Easing.cubic) };

const Stage: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Sequence from={IN}>
    <Rise>{children}</Rise>
  </Sequence>
);

const Window: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <Browser width={PAGE.w * WIN.scale} height={PAGE.h * WIN.scale} scale={WIN.scale} style={{ left: WIN.left, top: WIN.top }}>
    {children}
  </Browser>
);

const useSpringAt = (at: number, damping = 14) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - at, fps, config: { damping, stiffness: 200 } });
};

// Page centre of the n-th media row, and of the transition cards.
const mediaRow = (i: number): [number, number] => [MEDIA_BOX.x + 50, MEDIA_BOX.y + 81 + i * 60];
const DISSOLVE_CARD: [number, number] = [MEDIA_BOX.x + 62, MEDIA_BOX.y + MEDIA_BOX.h - 42];

const Thumb: React.FC<{ item: MediaItem; at: [number, number]; scale?: number; tilt?: number }> = ({ item, at, scale = 1, tilt = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: at[0],
      top: at[1],
      width: 120,
      height: 68,
      borderRadius: 10,
      overflow: "hidden",
      transform: `translate(-50%, -50%) rotate(${tilt}deg) scale(${scale})`,
      boxShadow: `0 18px 40px rgba(0,0,0,0.55), 0 0 0 1.5px ${C.accent}`,
      zIndex: 40,
    }}
  >
    <item.thumb t={40} />
  </div>
);

const stageWith = (keyed: number, title = 0) => (
  <>
    <Beach />
    <Host keyed={keyed} />
    {title > 0 && <Title text="Lisbon ’26" size="max(9cqw, 7.5cqh)" opacity={title} />}
  </>
);

// ---------------------------------------------------------------- Drop

export const Drop: React.FC = () => {
  const frame = useCurrentFrame() - IN;
  const DROP = 38;
  const GRAB = 66;
  const LAND = 96;
  const path: [number, number, number][] = [
    [0, 1000, 330],
    [32, 130, 200],
    [DROP + 14, 130, 200],
    [GRAB - 4, ...mediaRow(1)],
    [GRAB, ...mediaRow(1)],
    [LAND, tlX(4.5), trackY("V1")],
    [LAND + 30, tlX(9), trackY("V1") - 120],
  ];
  const stack = pathAt(frame, path);
  const shrink = interpolate(frame, [DROP, DROP + 7], [1, 0], clamp);
  const media = MEDIA.map((m, i) => ({ ...m, pop: interpolate(frame, [DROP + 6 + i * 4, DROP + 14 + i * 4], [0, 1], ease), active: frame >= GRAB && frame < LAND && i === 1 }));
  const drop = interpolate(frame, [18, 26, DROP, DROP + 6], [0, 1, 1, 0], clamp);
  const dragging = frame >= GRAB && frame < LAND;
  const pop = interpolate(frame, [LAND, LAND + 8], [0, 1], ease);
  const clips = pair({ id: "coast", media: "coast", start: 0, dur: 9.6, tone: TONES.coast, selected: frame >= LAND }).map((c) => ({ ...c, pop }));
  return (
    <AbsoluteFill>
      <Background />
      <Camera origin={screen(260, 300)} keys={[[IN + 4, 1], [IN + 30, 1.18], [IN + 70, 1.18], [IN + 100, 1.05]]}>
        <Stage>
          <Window>
            <Editor
              media={media}
              mediaDrop={drop}
              clips={clips}
              playhead={0}
              stage={frame >= LAND ? <Coast /> : null}
              propsTitle={frame >= LAND ? "Video clip" : "Properties"}
              props={
                frame >= LAND ? (
                  <TransformProps thumb={thumbOf("coast")} name="drone_cliffs.mp4" start="00:00.00" />
                ) : (
                  <div style={{ padding: 16, color: C.muted, fontSize: 12 }}>Select a clip to edit it.</div>
                )
              }
            >
              {shrink > 0 &&
                [2, 1, 0].map((i) => (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: stack[0] + i * 10,
                      top: stack[1] + i * 8,
                      transform: `translate(-30%, -30%) rotate(${-4 + i * 5}deg) scale(${shrink})`,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "9px 14px 9px 9px",
                      background: "#253027",
                      border: `1px solid ${C.accent}`,
                      borderRadius: 10,
                      boxShadow: "0 18px 40px rgba(0,0,0,0.55)",
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      zIndex: 40,
                    }}
                  >
                    <div style={{ width: 48, height: 28, borderRadius: 6, position: "relative", overflow: "hidden" }}>
                      {React.createElement(MEDIA[i].thumb, { t: 20 })}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700 }}>{MEDIA[i].name}</div>
                      <div style={{ color: C.dim, fontSize: 11, marginTop: 2 }}>+{MEDIA.length - 1} more files</div>
                    </div>
                  </div>
                ))}
              {dragging && <Thumb item={MEDIA[1]} at={[stack[0] + 50, stack[1] + 30]} tilt={-4} scale={0.9} />}
              <Pointer path={path} clicks={[GRAB, LAND]} />
            </Editor>
          </Window>
        </Stage>
        <Callout at={DROP + 30} until={GRAB + 6} style={{ left: 640, top: 360 }}>
          MP4 · MOV · WebM · images · GIFs
        </Callout>
        <Callout at={LAND + 14} style={{ left: 820, top: 660 }}>
          Drag it onto the timeline
        </Callout>
      </Camera>
      <BigWord word="Drop." />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Cut

export const Cut: React.FC = () => {
  const frame = useCurrentFrame() - IN;
  const SPLIT_ON = 16;
  const CUT = 40;
  const GRAB = 64;
  const LAND = 92;
  const SPLIT_BTN: [number, number] = [TL_BOX.x + 48, TL_BOX.y + 23];
  const path: [number, number, number][] = [
    [0, 700, 330],
    [14, ...SPLIT_BTN],
    [SPLIT_ON + 6, ...SPLIT_BTN],
    [CUT - 2, tlX(15), trackY("V1")],
    [CUT + 8, tlX(15), trackY("V1")],
    [GRAB - 2, ...DISSOLVE_CARD],
    [GRAB, ...DISSOLVE_CARD],
    [LAND, tlX(8.4), trackY("V1")],
    [LAND + 30, tlX(11), trackY("V1") + 90],
  ];
  const pointer = pathAt(frame, path);
  const split = frame >= SPLIT_ON && frame < CUT + 14;
  const before = baseClips().filter((c) => !c.id.startsWith("coastB") && c.track !== "V2" && c.track !== "A2");
  const clips: Clip[] =
    frame < CUT
      ? before.map((c) => (c.id.startsWith("coastA") ? { ...c, dur: 13.6 } : c))
      : baseClips().filter((c) => c.track !== "V2" && c.track !== "A2");
  const dragging = frame >= GRAB && frame < LAND;
  const pop = useSpringAt(LAND, 10);
  return (
    <AbsoluteFill>
      <Background />
      <Camera origin={screen(560, 560)} keys={[[IN + 4, 1], [IN + 30, 1.32]]}>
        <Stage>
          <Window>
            <Editor
              media={MEDIA}
              lift={dragging ? "dissolve" : undefined}
              clips={clips}
              transitions={frame >= LAND ? [{ at: 8.4, kind: "dissolve", pop }] : []}
              cutFlash={frame >= CUT ? { at: 15, p: interpolate(frame, [CUT, CUT + 18], [0, 1], clamp) } : undefined}
              playhead={15}
              split={split}
              stage={<Coast />}
              propsTitle="Properties"
              props={<div style={{ padding: 16, color: C.muted, fontSize: 12 }}>Select a clip to edit it.</div>}
            >
              {dragging && (
                <div
                  style={{
                    position: "absolute",
                    left: pointer[0] + 14,
                    top: pointer[1] + 10,
                    padding: "7px 12px",
                    borderRadius: 8,
                    background: C.surface,
                    border: `1px solid ${C.accent}`,
                    fontSize: 12,
                    fontWeight: 600,
                    boxShadow: "0 14px 30px rgba(0,0,0,0.5)",
                    zIndex: 40,
                    whiteSpace: "nowrap",
                  }}
                >
                  Cross dissolve
                </div>
              )}
              <Pointer path={path} clicks={[SPLIT_ON, CUT, GRAB, LAND]} />
            </Editor>
          </Window>
        </Stage>
        <Callout at={CUT + 4} until={GRAB} style={{ left: 980, top: 560 }}>
          Split at any frame · S
        </Callout>
        <Callout at={LAND + 8} style={{ left: 660, top: 500 }}>
          Cross dissolve · Fade to black
        </Callout>
      </Camera>
      <BigWord word="Cut." />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Key

export const Key: React.FC = () => {
  const frame = useCurrentFrame() - IN;
  const PICK = 18;
  const CLICK = 46;
  const PICK_BTN: [number, number] = [PROPS_BOX.x + PROPS_BOX.w - 46, PROPS_BOX.y + 161];
  const s = stageSize(16 / 9);
  const GREEN: [number, number] = [STAGE_CENTER[0] - s.w * 0.3, STAGE_CENTER[1] - s.h * 0.22];
  const path: [number, number, number][] = [
    [0, 700, 640],
    [16, ...PICK_BTN],
    [PICK + 6, ...PICK_BTN],
    [CLICK - 4, ...GREEN],
    [CLICK + 20, ...GREEN],
    [CLICK + 46, GREEN[0] + 60, GREEN[1] + 150],
  ];
  const picking = frame >= PICK && frame < CLICK;
  const keyed = interpolate(frame, [CLICK + 2, CLICK + 16], [0, 1], ease);
  const tol = interpolate(frame, [CLICK + 2, CLICK + 24], [0, 1], ease);
  const pointer = pathAt(frame, path);
  return (
    <AbsoluteFill>
      <Background />
      <Camera origin={screen(STAGE_CENTER[0], STAGE_CENTER[1])} keys={[[IN + 34, 1], [IN + 56, 1.42]]}>
        <Stage>
          <Window>
            <Editor
              media={MEDIA.map((m) => ({ ...m, active: m.id === "host" }))}
              clips={baseClips({ selectHost: true })}
              transitions={[{ at: 8.4, kind: "dissolve" }]}
              playhead={12.4}
              stage={stageWith(keyed)}
              stageOverlay={
                picking && (
                  <div
                    style={{
                      position: "absolute",
                      top: 10,
                      left: "50%",
                      transform: "translateX(-50%)",
                      padding: "6px 12px",
                      borderRadius: 8,
                      background: "rgba(12,14,13,0.85)",
                      border: `1px solid ${C.control}`,
                      fontSize: 12,
                      whiteSpace: "nowrap",
                      color: C.text,
                    }}
                  >
                    Click a colour on this clip in the preview <span style={{ color: C.muted }}>· Esc to cancel</span>
                  </div>
                )
              }
              propsTitle="Video clip"
              props={
                <KeyProps
                  thumb={thumbOf("host")}
                  name="host_greenscreen.mp4"
                  start="00:09.00"
                  on={keyed > 0}
                  picking={picking}
                  color={frame >= CLICK ? "#00b140" : undefined}
                  tolerance={tol}
                />
              }
            >
              {picking && frame > 30 && (
                <div
                  style={{
                    position: "absolute",
                    left: pointer[0] + 14,
                    top: pointer[1] + 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 8px 4px 4px",
                    borderRadius: 8,
                    background: "rgba(12,14,13,0.9)",
                    border: `1px solid ${C.control}`,
                    fontSize: 11,
                    fontFamily: mono,
                    zIndex: 45,
                  }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: 5, background: "#00b140", border: "1px solid rgba(255,255,255,0.4)" }} />
                  #00B140
                </div>
              )}
              <Pointer path={path} clicks={[PICK, CLICK]} />
            </Editor>
          </Window>
        </Stage>
        <Callout at={CLICK + 14} until={CLICK + 64} style={{ left: 1000, top: 330 }}>
          Click the green. It’s gone.
        </Callout>
        <Callout at={CLICK + 70} style={{ left: 560, top: 620 }}>
          Chroma key, live in the preview
        </Callout>
      </Camera>
      <BigWord word="Key." />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Reframe

export const Reframe: React.FC = () => {
  const frame = useCurrentFrame() - IN;
  const OPEN = 16;
  const PICK = 40;
  const path: [number, number, number][] = [
    [0, 820, 330],
    [14, ...ASPECT_PILL],
    [OPEN + 6, ...ASPECT_PILL],
    [30, ASPECT_PILL[0] - 40, ASPECT_ROW_Y(0)],
    [PICK - 4, ASPECT_PILL[0] - 40, ASPECT_ROW_Y(1)],
    [PICK + 30, ASPECT_PILL[0] - 120, 330],
  ];
  const py = pathAt(frame, path)[1];
  const hover = ASPECTS.reduce((best, _, i) => (Math.abs(ASPECT_ROW_Y(i) - py) < Math.abs(ASPECT_ROW_Y(best) - py) ? i : best), 0);
  const open = frame < PICK ? interpolate(frame, [OPEN, OPEN + 5], [0, 1], clamp) : interpolate(frame, [PICK + 3, PICK + 8], [1, 0], clamp);
  const morph = interpolate(frame, [PICK + 4, PICK + 22], [0, 1], ease);
  // Morph the frame's log-ratio, so landscape and portrait take the same time.
  const ratio = Math.exp(Math.log(16 / 9) * (1 - 2 * morph));
  return (
    <AbsoluteFill>
      <Background />
      <Camera origin={screen(STAGE_CENTER[0] + 80, STAGE_CENTER[1])} keys={[[IN + 4, 1], [IN + 30, 1.3]]}>
        <Stage>
          <Window>
            <Editor
              media={MEDIA}
              clips={baseClips()}
              transitions={[{ at: 8.4, kind: "dissolve" }]}
              playhead={4.2}
              stage={stageWith(1, 1)}
              ratio={ratio}
              aspect={frame >= PICK ? "9:16 1080×1920" : "16:9 1920×1080"}
              aspectOpen={open > 0}
              propsTitle="Video clip"
              props={<TransformProps thumb={thumbOf("beach")} name="praia_morning.mp4" start="00:00.00" />}
            >
              <AspectMenu hover={hover} selected={frame >= PICK ? 1 : 0} open={open} />
              <Pointer path={path} clicks={[OPEN, PICK]} />
            </Editor>
          </Window>
        </Stage>
        <Callout at={PICK + 20} style={{ left: 1090, top: 560 }}>
          16:9 · 9:16 · 1:1 · 4:5 · 4:3 · 21:9
        </Callout>
      </Camera>
      <BigWord word="Reframe." />
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------- Export

export const Export: React.FC = () => {
  const frame = useCurrentFrame() - IN;
  const OPEN = 16;
  const START = 40;
  const DONE = 104;
  const DOWNLOAD = 124;
  const EXPORT_BTN: [number, number] = [PAGE.w - 62, 26];
  const START_BTN: [number, number] = [906, 482];
  const DOWNLOAD_BTN: [number, number] = [910, 333];
  const path: [number, number, number][] = [
    [0, 900, 330],
    [14, ...EXPORT_BTN],
    [OPEN + 6, ...EXPORT_BTN],
    [START - 4, ...START_BTN],
    [START + 20, ...START_BTN],
    [DOWNLOAD - 6, ...DOWNLOAD_BTN],
    [DOWNLOAD + 30, DOWNLOAD_BTN[0] + 40, DOWNLOAD_BTN[1] + 90],
  ];
  const show = interpolate(frame, [OPEN + 2, OPEN + 12], [0, 1], ease);
  const progress = interpolate(frame, [START + 4, DONE - 4], [0, 1], { ...clamp, easing: Easing.inOut(Easing.quad) });
  const step = frame < START + 2 ? "settings" : frame < DONE ? "rendering" : "done";
  const playhead = step === "rendering" ? progress * 35 : 0;
  return (
    <AbsoluteFill>
      <Background />
      <Camera origin={screen(720, 330)} keys={[[IN + 26, 1], [IN + 46, 1.25]]}>
        <Stage>
          <Window>
            <Editor
              media={MEDIA}
              clips={baseClips()}
              transitions={[{ at: 8.4, kind: "dissolve" }]}
              playhead={playhead}
              playing={step === "rendering"}
              stage={stageWith(1, 1)}
              propsTitle="Properties"
              props={<div style={{ padding: 16, color: C.muted, fontSize: 12 }}>Select a clip to edit it.</div>}
              exportPressed={frame >= OPEN && frame < OPEN + 5}
            >
              <ExportDialog
                step={step}
                progress={progress}
                show={show}
                pressed={frame >= START && frame < START + 5 ? "start" : frame >= DOWNLOAD && frame < DOWNLOAD + 5 ? "download" : undefined}
              />
              <Pointer path={path} clicks={[OPEN, START, DOWNLOAD]} />
            </Editor>
          </Window>
        </Stage>
        <Callout at={START + 10} until={DONE} style={{ left: 1260, top: 380 }}>
          Rendered on your device
        </Callout>
        <Callout at={DONE + 6} style={{ left: 660, top: 860 }}>
          MP4 · H.264 + AAC · up to 1080p
        </Callout>
      </Camera>
      <BigWord word="Export." />
    </AbsoluteFill>
  );
};
