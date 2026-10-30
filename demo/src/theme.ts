import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { loadFont as loadSans } from "@remotion/google-fonts/Figtree";

export const mono = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin", "latin-ext"] }).fontFamily;
export const sans = loadSans("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin", "latin-ext"] }).fontFamily;

// The editor's own palette (src/styles.css), plus a darker stage around it.
export const C = {
  stage: "#0c0e0d",
  accent: "#c6f0bf",
  bg: "#171918",
  panel: "#1e2320",
  surface: "#1f2421",
  inset: "#151816",
  hover: "#262c28",
  selected: "#323934",
  line: "#2a302c",
  lineStrong: "#2e3530",
  control: "#323934",
  text: "#f1f4f0",
  bright: "#f4f7f3",
  soft: "#c8cec9",
  dim: "#a3aaa4",
  muted: "#8c948e",
  warn: "#e8b04b",
  red: "#f87171",
};

export const SITE = "video.gimeno.dev";

export const FPS = 30;
