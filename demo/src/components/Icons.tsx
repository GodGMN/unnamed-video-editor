import React from "react";

// Line icons in the editor's style: 24px grid, round caps.
const Svg: React.FC<{ size?: number; color?: string; width?: number; children: React.ReactNode }> = ({ size = 14, color = "currentColor", width = 2, children }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none" }}>
    {children}
  </svg>
);

type P = { size?: number; color?: string };

export const Plus: React.FC<P> = (p) => <Svg {...p}><path d="M12 5v14M5 12h14" /></Svg>;
export const Undo: React.FC<P> = (p) => <Svg {...p}><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></Svg>;
export const Redo: React.FC<P> = (p) => <Svg {...p}><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></Svg>;
export const Expand: React.FC<P> = (p) => <Svg {...p}><path d="M3 8V5a2 2 0 0 1 2-2h3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M8 21H5a2 2 0 0 1-2-2v-3" /></Svg>;
export const Gear: React.FC<P> = (p) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68 1.65 1.65 0 0 0 10 3.17V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </Svg>
);
export const Download: React.FC<P> = (p) => <Svg {...p}><path d="M12 3v12M7 10l5 5 5-5M5 21h14" /></Svg>;
export const Pencil: React.FC<P> = (p) => <Svg {...p}><path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" /></Svg>;
export const Scissors: React.FC<P> = (p) => (
  <Svg {...p}>
    <circle cx="6" cy="6" r="3" />
    <circle cx="6" cy="18" r="3" />
    <path d="M20 4 8.12 15.88M14.47 14.48 20 20M8.12 8.12 12 12" />
  </Svg>
);
export const TextIcon: React.FC<P> = (p) => <Svg {...p}><path d="M5 5h14M12 5v14M9 19h6" /></Svg>;
export const Magnet: React.FC<P> = (p) => <Svg {...p}><path d="M6 3v9a6 6 0 0 0 12 0V3M6 8h4M14 8h4M10 3v9a2 2 0 0 0 4 0V3" /></Svg>;
export const Eye: React.FC<P> = (p) => <Svg {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Svg>;
export const Speaker: React.FC<P> = (p) => <Svg {...p}><path d="M11 5 6 9H2v6h4l5 4V5ZM15.5 8.5a5 5 0 0 1 0 7" /></Svg>;
export const Link: React.FC<P> = (p) => <Svg {...p}><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></Svg>;
export const Chevron: React.FC<P> = (p) => <Svg {...p}><path d="m6 9 6 6 6-6" /></Svg>;
export const Check: React.FC<P> = (p) => <Svg {...p}><path d="M5 12.5 10 17.5 19.5 7" /></Svg>;
export const Close: React.FC<P> = (p) => <Svg {...p}><path d="M6 6l12 12M18 6 6 18" /></Svg>;
export const Pipette: React.FC<P> = (p) => <Svg {...p}><path d="m2 22 1-1h3l9-9M3 21v-3l9-9M15 6l3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z" /></Svg>;
export const SkipStart: React.FC<P> = (p) => <Svg {...p}><path d="M6 5v14M19 5 9 12l10 7V5Z" /></Svg>;
export const SkipEnd: React.FC<P> = (p) => <Svg {...p}><path d="M18 5v14M5 5l10 7-10 7V5Z" /></Svg>;
export const Prev: React.FC<P> = (p) => <Svg {...p}><path d="m15 18-6-6 6-6" /></Svg>;
export const Next: React.FC<P> = (p) => <Svg {...p}><path d="m9 18 6-6-6-6" /></Svg>;
export const Play: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: "none" }}>
    <path d="M7 4.5v15l12.5-7.5L7 4.5Z" fill={color} />
  </svg>
);
export const Pause: React.FC<{ size?: number; color?: string }> = ({ size = 14, color = "currentColor" }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ flex: "none" }}>
    <rect x="6" y="4.5" width="4" height="15" rx="1" fill={color} />
    <rect x="14" y="4.5" width="4" height="15" rx="1" fill={color} />
  </svg>
);
export const Frame: React.FC<{ size?: number; color?: string; ratio: number }> = ({ size = 14, color = "currentColor", ratio }) => {
  const w = ratio >= 1 ? 16 : 16 * ratio;
  const h = ratio >= 1 ? 16 / ratio : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} style={{ flex: "none" }}>
      <rect x={12 - w / 2} y={12 - h / 2} width={w} height={h} rx={1.6} />
    </svg>
  );
};
