import { useId } from 'react';
import type { ReactNode } from 'react';

export type FlagCode = 'gb' | 'es';

/** A 3:2 national flag, painted by hand so it looks the same on every OS (Windows has no flag emoji). */
export function Flag({ code, width = 21 }: { code?: FlagCode; width?: number }) {
  const id = useId();
  const flags: Record<FlagCode, ReactNode> = {
    gb: (
      <>
        <clipPath id={id}><path d="M30 15h30v15zv15H0zH0V0zV0h30z" /></clipPath>
        <rect width="60" height="40" y="-5" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#C8102E" strokeWidth="4" clipPath={`url(#${id})`} />
        <path d="M30 -5v40M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 -5v40M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </>
    ),
    es: (
      <>
        <rect width="60" height="40" y="-5" fill="#AA151B" />
        <rect width="60" height="20" y="5" fill="#F1BF00" />
      </>
    ),
  };
  return (
    <svg className="flag" width={width} height={width * 2 / 3} viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      {code ? flags[code] : <rect width="60" height="30" fill="var(--control)" />}
    </svg>
  );
}
