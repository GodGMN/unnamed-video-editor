import React from "react";
import { Composition } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { Outro, Poster, Problem, TitleCard } from "./scenes/Intro";
import { Cut, Drop, Export, Key, Reframe } from "./scenes/Features";
import { FPS } from "./theme";

const T = 12;

const SCENES: { c: React.FC; d: number; t?: "fade" | "slide" }[] = [
  { c: Poster, d: 24 },
  { c: Problem, d: 125 },
  { c: TitleCard, d: 95, t: "fade" },
  { c: Drop, d: 165, t: "slide" },
  { c: Cut, d: 170, t: "slide" },
  { c: Key, d: 170, t: "slide" },
  { c: Reframe, d: 140, t: "slide" },
  { c: Export, d: 180, t: "slide" },
  { c: Outro, d: 150, t: "fade" },
];

const DURATION = SCENES.reduce((n, s) => n + s.d - (s.t ? T : 0), 0);

const Promo: React.FC = () => (
  <TransitionSeries>
    {SCENES.flatMap(({ c: Scene, d, t }, i) => [
      ...(t
        ? [
            <TransitionSeries.Transition
              key={`t${i}`}
              presentation={t === "fade" ? fade() : slide({ direction: "from-right" })}
              timing={linearTiming({ durationInFrames: T })}
            />,
          ]
        : []),
      <TransitionSeries.Sequence key={`s${i}`} durationInFrames={d}>
        <Scene />
      </TransitionSeries.Sequence>,
    ])}
  </TransitionSeries>
);

export const Root: React.FC = () => (
  <Composition id="EditorPromo" component={Promo} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />
);
