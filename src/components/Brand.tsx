import { LogoFilm } from './icons';

export const APP_NAME = '[Unnamed Video Editor]';

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className="brand">
      <div className="brand-mark">
        <LogoFilm size={large ? 32 : 26} fill="var(--accent)" />
      </div>
      <span className="brand-name">{APP_NAME}<span className="dot">.</span></span>
    </div>
  );
}
