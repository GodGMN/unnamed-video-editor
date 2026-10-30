import { Brand } from './Brand';

export function DesktopOnly({ width }: { width: number }) {
  return (
    <div className="gate">
      <Brand large />
      <div className="gate-main">
        <div className="gate-card">
          <svg width="56" height="44" viewBox="0 0 56 44" aria-hidden="true">
            <rect x="0" y="0" width="56" height="34" rx="5" fill="var(--accent)" />
            <rect x="5" y="5" width="46" height="24" rx="2" fill="var(--bg)" opacity="0.2" />
            <rect x="20" y="38" width="16" height="4" rx="2" fill="var(--accent)" />
          </svg>
          <h1>Open this on a bigger screen<span className="dot">.</span></h1>
          <p>The editor needs a window at least 1280 px wide. Widen your browser or switch to a desktop computer — your project stays where you left it.</p>
          <span className="pill">Current width: {width} px</span>
        </div>
      </div>
    </div>
  );
}
