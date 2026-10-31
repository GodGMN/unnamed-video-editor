import { Beach, Coast, Dinner, Host, Sunset } from "./components/Footage";
import type { Clip, MediaItem } from "./components/Editor";

// The invented "Finde en Lisboa" project every scene edits.

export const MEDIA: MediaItem[] = [
  { id: "beach", name: "praia_morning.mp4", meta: "1920×1080 · 30 fps · H.264", dur: "0:18", thumb: Beach },
  { id: "coast", name: "drone_cliffs.mp4", meta: "3840×2160 · 30 fps · escalado a la salida", dur: "0:24", thumb: Coast },
  { id: "dinner", name: "dinner_alfama.mp4", meta: "1920×1080 · 60 fps", dur: "0:31", thumb: Dinner },
  { id: "host", name: "host_greenscreen.mp4", meta: "1920×1080 · 30 fps · H.264", dur: "0:09", thumb: Host },
  { id: "sunset", name: "sunset_tejo.webm", meta: "1920×1080 · VP9", dur: "0:12", thumb: Sunset },
];

export const thumbOf = (id: string) => MEDIA.find((m) => m.id === id)!.thumb;

type Spec = { id: string; media: string; start: number; dur: number; tone: string; track?: "V1" | "V2"; selected?: boolean; db?: string };

/** A video clip and its linked audio clip. */
export const pair = ({ id, media, start, dur, tone, track = "V1", selected, db }: Spec): Clip[] => {
  const name = MEDIA.find((m) => m.id === media)!.name;
  return [
    { id: `${id}-v`, track, start, dur, name, thumb: thumbOf(media), tone, selected },
    { id: `${id}-a`, track: track === "V1" ? "A1" : "A2", start, dur, name, db },
  ];
};

export const TONES = { beach: "#2C4756", coast: "#35503F", dinner: "#5A4530", host: "#1d5a35", sunset: "#4A3A52" };

export const TITLE: Clip = { id: "title", track: "T", start: 1.5, dur: 5, name: "Lisboa ’26" };

/** The cut-together timeline the later scenes start from. */
export const baseClips = (opts: { selectHost?: boolean } = {}): Clip[] => [
  TITLE,
  ...pair({ id: "beach", media: "beach", start: 0, dur: 8.4, tone: TONES.beach }),
  ...pair({ id: "coastA", media: "coast", start: 8.4, dur: 6.6, tone: TONES.coast, db: "-1,9 dB" }),
  ...pair({ id: "coastB", media: "coast", start: 15, dur: 7, tone: TONES.coast, db: "-1,9 dB" }),
  ...pair({ id: "dinner", media: "dinner", start: 22, dur: 7.4, tone: TONES.dinner }),
  ...pair({ id: "sunset", media: "sunset", start: 29.4, dur: 5.6, tone: TONES.sunset }),
  ...pair({ id: "host", media: "host", start: 9, dur: 7, tone: TONES.host, track: "V2", selected: opts.selectHost, db: "-4,4 dB" }),
];
