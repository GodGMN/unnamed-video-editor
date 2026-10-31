import { useT } from '../../i18n';
import { t as translate } from '../../i18n/core';
import { clipDuration, findAudioClip, findVideoClip } from '../../editor/model';
import type { Fades } from '../../editor/model';
import type { Editor } from '../../editor/useProject';
import { Slider } from '../Slider';

/** Fades can't take more than half the clip each, and longer than this is rarely wanted. */
const MAX_FADE = 5;

/** Fade lengths as sliders; on a desktop they're dragged from the clip's corners instead. */
export function FadesSheet({ editor }: { editor: Editor }) {
  useT();
  const { project, ui } = editor;
  const id = ui.sel?.id;
  const video = ui.sel?.kind === 'clip' ? findVideoClip(project, id) : null;
  const audio = ui.sel?.kind === 'audio' ? findAudioClip(project, id) : null;
  const clip = video ?? audio;
  if (!clip) return null;
  const max = Math.max(0.1, Math.min(MAX_FADE, Math.floor(clipDuration(clip) / 2 * 10) / 10));
  const update = (patch: Partial<Fades>) => (video ? editor.updateVideoClip(clip.id, patch) : editor.updateAudioClip(clip.id, patch));
  return (
    <div className="props-section" style={{ borderTop: 0 }}>
      <Slider label={translate('fadeIn')} value={Math.min(clip.fadeIn, max)} unit="s" min={0} max={max} step={0.1} defaultValue={0}
        format={(v) => v.toFixed(1)} onChange={(v) => update({ fadeIn: Math.round(v * 10) / 10 })} />
      <Slider label={translate('fadeOut')} value={Math.min(clip.fadeOut, max)} unit="s" min={0} max={max} step={0.1} defaultValue={0}
        format={(v) => v.toFixed(1)} onChange={(v) => update({ fadeOut: Math.round(v * 10) / 10 })} />
    </div>
  );
}
