import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, linkClips, partnersOf, pickedPair } from '../src/editor/model.ts';

const base = (id, linkId) => ({ id, start: 0, mediaId: 'm', inS: 0, outS: 5, linkId, linked: !!linkId });
const project = () => ({ name: 'Test', media: {}, output: { width: 1920, height: 1080, fps: 30 }, tracks: [
  { kind: 'video', id: 'v', name: 'V1', label: '', hidden: false, magnetic: false, clips: [{ ...VIDEO_CLIP_DEFAULTS, ...base('v1', 'old') }] },
  { kind: 'audio', id: 'a', name: 'A1', label: '', muted: false, clips: [{ ...AUDIO_CLIP_DEFAULTS, ...base('a1', 'old') }, { ...AUDIO_CLIP_DEFAULTS, ...base('a2', null), start: 6 }] },
] });

test('pickedPair needs exactly one video and one audio clip', () => {
  const p = project();
  assert.equal(pickedPair(p, [{ kind: 'clip', id: 'v1' }]), null);
  assert.equal(pickedPair(p, [{ kind: 'audio', id: 'a1' }, { kind: 'audio', id: 'a2' }]), null);
  assert.equal(pickedPair(p, [{ kind: 'clip', id: 'v1' }, { kind: 'audio', id: 'a1' }, { kind: 'audio', id: 'a2' }]), null);
  const pair = pickedPair(p, [{ kind: 'audio', id: 'a2' }, { kind: 'clip', id: 'v1' }]);
  assert.deepEqual([pair.video.id, pair.audio.id], ['v1', 'a2']);
});

test('linking a new pair detaches the old partner', () => {
  const p = linkClips(project(), 'v1', 'a2', 'new');
  const [v1] = p.tracks[0].clips;
  const [a1, a2] = p.tracks[1].clips;
  assert.deepEqual(partnersOf(p, v1).map(c => c.id), ['a2']);
  assert.deepEqual(partnersOf(p, a1), []);
  assert.equal(v1.linked && a2.linked, true);
});
