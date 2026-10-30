import { LogoPlay } from './icons';

export const APP_NAME = '[Unnamed Video Editor]';

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <LogoPlay size={large ? 14 : 12} fill="var(--bg)" />
      </div>
      <span className="brand-name">{APP_NAME}<span className="dot">.</span></span>
    </div>
  );
}
