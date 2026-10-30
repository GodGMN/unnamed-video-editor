import type { ReactNode, SVGProps } from 'react';

type IconProps = Omit<SVGProps<SVGSVGElement>, 'stroke'> & { size?: number; stroke?: string; strokeWidth?: number };

function Stroke({ size = 16, stroke = 'currentColor', strokeWidth = 2, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

function Fill({ size = 16, fill = 'currentColor', children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const LogoPlay = (p: IconProps) => <Fill {...p}><path d="M6 4l14 8-14 8z" /></Fill>;
export const Play = (p: IconProps) => <Fill {...p}><path d="M7 4l13 8-13 8z" /></Fill>;
export const Pause = (p: IconProps) => <Fill {...p}><path d="M6 4h4v16H6zM14 4h4v16h-4z" /></Fill>;
export const Pencil = (p: IconProps) => <Stroke {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z" /></Stroke>;
export const Undo = (p: IconProps) => <Stroke {...p}><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 010 11H11" /></Stroke>;
export const Redo = (p: IconProps) => <Stroke {...p}><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 000 11H13" /></Stroke>;
export const Download = (p: IconProps) => <Stroke {...p}><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></Stroke>;
export const Plus = (p: IconProps) => <Stroke {...p}><path d="M12 5v14M5 12h14" /></Stroke>;
export const Warning = (p: IconProps) => <Stroke {...p}><path d="M12 3l10 18H2z" /><path d="M12 10v4M12 17.5v.01" /></Stroke>;
export const Convert = (p: IconProps) => <Stroke {...p}><path d="M4 12a8 8 0 0114-5.3L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 01-14 5.3L4 15" /><path d="M4 20v-5h5" /></Stroke>;
export const SkipStart = (p: IconProps) => <Fill {...p}><path d="M5 5h2v14H5zM19 5v14L8 12z" /></Fill>;
export const SkipEnd = (p: IconProps) => <Fill {...p}><path d="M17 5h2v14h-2zM5 5v14l11-7z" /></Fill>;
export const ChevronLeft = (p: IconProps) => <Stroke {...p}><path d="M15 6l-6 6 6 6" /></Stroke>;
export const ChevronRight = (p: IconProps) => <Stroke {...p}><path d="M9 6l6 6-6 6" /></Stroke>;
export const Volume = (p: IconProps) => <Stroke {...p}><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M15.5 8.5a5 5 0 010 7" /></Stroke>;
export const Mute = (p: IconProps) => <Stroke {...p}><path d="M11 5L6 9H3v6h3l5 4z" /><path d="M22 9l-6 6M16 9l6 6" /></Stroke>;
export const Waveform = (p: IconProps) => <Stroke {...p}><path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" /></Stroke>;
export const Cursor = (p: IconProps) => <Stroke {...p}><path d="M5 3l14 8-6 2-3 6z" /></Stroke>;
export const Scissors = (p: IconProps) => <Stroke {...p}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></Stroke>;
export const TextT = (p: IconProps) => <Stroke {...p}><path d="M5 6V4h14v2M12 4v16M9 20h6" /></Stroke>;
export const Eye = (p: IconProps) => <Stroke {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Stroke>;
export const Link = (p: IconProps) => <Stroke {...p}><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></Stroke>;
export const Unlink = (p: IconProps) => <Stroke {...p}><path d="M15 9l3-3a3 3 0 00-4.2-4.2l-3 3" /><path d="M9 15l-3 3a3 3 0 004.2 4.2l3-3" /><path d="M4 4l16 16" /></Stroke>;
export const Crossfade = (p: IconProps) => <Stroke {...p}><circle cx="9" cy="12" r="6" /><circle cx="15" cy="12" r="6" /></Stroke>;
export const FadeBlack = (p: IconProps) => <Stroke {...p}><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 4v16M15 4l5 5M12 9l8 8M12 15l5 5" strokeWidth={1.6} /></Stroke>;
export const CutLine = (p: IconProps) => <Stroke {...p}><path d="M12 4v16" /></Stroke>;
export const Duplicate = (p: IconProps) => <Stroke {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2" /></Stroke>;
export const Trash = (p: IconProps) => <Stroke {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Stroke>;
export const Close = (p: IconProps) => <Stroke {...p}><path d="M6 6l12 12M18 6L6 18" /></Stroke>;
export const ArrowRight = (p: IconProps) => <Stroke {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Stroke>;
export const Info = (p: IconProps) => <Stroke {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.01" /></Stroke>;
export const Clock = (p: IconProps) => <Stroke {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></Stroke>;
export const Check = (p: IconProps) => <Stroke {...p}><path d="M5 12l5 5 9-10" /></Stroke>;
export const Maximize = (p: IconProps) => <Stroke {...p}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></Stroke>;
export const Minimize = (p: IconProps) => <Stroke {...p}><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" /></Stroke>;
export const Reset = (p: IconProps) => <Stroke {...p}><path d="M4 12a8 8 0 102.3-5.7L4 8.6" /><path d="M4 4v4.6h4.6" /></Stroke>;

export const Checker = (p: IconProps) => <Stroke {...p}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /><path d="M4.5 4.5h7.5v7.5H4.5zM12 12h7.5v7.5H12z" fill="currentColor" stroke="none" /></Stroke>;
export const Dropper = (p: IconProps) => <Stroke {...p}><path d="M14.5 5.5l4 4" /><path d="M17 3a2.1 2.1 0 013 3l-2.5 2.5-3-3z" /><path d="M15.5 7.5L6 17l-1 3 3-1 9.5-9.5" /></Stroke>;
export const Magnet = (p: IconProps) => <Stroke {...p}><path d="M4 3h5v10a3 3 0 006 0V3h5v10a8 8 0 01-16 0zM4 7h5M15 7h5" /></Stroke>;
export const Cog = (p: IconProps) => <Stroke {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></Stroke>;
export const GitHub = (p: IconProps) => <Fill {...p}><path d="M12 2a10 10 0 00-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.4-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.4-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 011-2.7c-.1-.3-.4-1.3.1-2.7 0 0 .8-.3 2.8 1a9.6 9.6 0 015 0c1.9-1.3 2.8-1 2.8-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 011 2.7c0 3.9-2.3 4.7-4.6 5 .4.3.7.9.7 1.9V21c0 .3.2.6.7.5A10 10 0 0012 2z" /></Fill>;
