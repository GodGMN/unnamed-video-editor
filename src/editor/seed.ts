import { AUDIO_CLIP_DEFAULTS, VIDEO_CLIP_DEFAULTS, settle } from './model';
import type { AudioClip, Media, Project, Transition, VideoClip } from './model';

/* Demo clip positions are explicit, just like user-authored timeline positions. */

const media: Media[] = [
  {
    id: 'intro', name: 'intro_beach.mp4', container: 'MP4', duration: 12.0, size: 18.6e6, bitrate: 12.4e6,
    video: { codec: 'avc1.640028', width: 1920, height: 1080, fps: 30 },
    audio: { codec: 'mp4a.40.2', sampleRate: 48000, channels: 2 },
    decodable: true, tone: '#2C4756', seed: 1,
  },
  {
    id: 'drone', name: 'drone_coast.mp4', container: 'MP4', duration: 24.6, size: 138.7e6, bitrate: 45.1e6,
    video: { codec: 'avc1.640033', width: 3840, height: 2160, fps: 29.97 },
    audio: { codec: 'mp4a.40.2', sampleRate: 48000, channels: 2 },
    decodable: true, tone: '#35503F', seed: 2,
  },
  {
    id: 'toast', name: 'dinner_toast.mp4', container: 'MP4', duration: 31.8, size: 63.6e6, bitrate: 16.0e6,
    video: { codec: 'avc1.4d402a', width: 1920, height: 1080, fps: 59.94 },
    audio: { codec: 'mp4a.40.2', sampleRate: 44100, channels: 2 },
    decodable: true, tone: '#5A4530', seed: 3,
  },
  {
    id: 'sunset', name: 'sunset_timelapse.webm', container: 'WebM', duration: 18.0, size: 14.0e6, bitrate: 6.2e6,
    video: { codec: 'vp09.00.40.08', width: 1920, height: 1080, fps: 30 },
    audio: { codec: 'opus', sampleRate: 48000, channels: 2 },
    decodable: true, tone: '#4A3A52', seed: 5,
  },
  {
    id: 'screenrec', name: 'screen_rec.mov', container: 'MOV', duration: 134, size: 412e6, bitrate: 24.6e6,
    video: { codec: 'hvc1.2.4.L150.B0', width: 2560, height: 1440, fps: 60 },
    audio: { codec: 'mp4a.40.2', sampleRate: 48000, channels: 2 },
    decodable: false, tone: '#24262B', seed: 6,
  },
];

interface PairSpec {
  id: string;
  mediaId: string;
  start?: number;
  inS: number;
  outS: number;
  linked?: boolean;
  video?: Partial<VideoClip>;
  audio?: Partial<AudioClip>;
  transitionOut?: Transition;
}

/** A video clip and its linked audio clip, cut from the same source. */
function pair(s: PairSpec): [VideoClip, AudioClip] {
  const common = { mediaId: s.mediaId, start: s.start ?? 0, inS: s.inS, outS: s.outS, linkId: s.id, linked: s.linked ?? true };
  return [
    { ...VIDEO_CLIP_DEFAULTS, ...common, id: `${s.id}-v`, transitionOut: s.transitionOut ?? null, ...s.video },
    { ...AUDIO_CLIP_DEFAULTS, ...common, id: `${s.id}-a`, ...s.audio },
  ];
}

const main = [
  pair({ id: 'intro', mediaId: 'intro', inS: 2.0, outS: 10.4, audio: { fadeIn: 1.2, curveIn: 0.6 },
    transitionOut: { type: 'crossfade', duration: 0.8 } }),
  pair({ id: 'drone', start: 7.6, mediaId: 'drone', inS: 3.2, outS: 14.0,
    video: { fit: 'custom', scale: 110, y: -20, cropB: 120 }, audio: { vol: 80, fadeOut: 1.5, curveOut: -0.5 },
    transitionOut: { type: 'cut', duration: 0.5 } }),
  pair({ id: 'toast1', start: 18.4, mediaId: 'toast', inS: 0, outS: 7.4, transitionOut: { type: 'fade', duration: 0.5 } }),
  pair({ id: 'toast2', start: 25.8, mediaId: 'toast', inS: 9.8, outS: 19.0, linked: false, audio: { muted: true, fadeOut: 1 } }),
];
const overlay = [
  pair({ id: 'sunset', mediaId: 'sunset', start: 27, inS: 4.0, outS: 10.0,
    video: { fit: 'custom', scale: 35, x: 560, y: -280 }, audio: { vol: 60, fadeIn: 0.6, fadeOut: 0.6 } }),
];

export function seedProject(): Project {
  return settle({
    name: 'Weekend trip',
    output: { width: 1920, height: 1080, fps: 30 },
    media: Object.fromEntries(media.map((m) => [m.id, m])),
    tracks: [
      {
        kind: 'text', id: 'T1', name: 'Text', label: '', hidden: false, items: [
          { id: 'title', content: 'Summer ’26', size: 72, color: '#FFFFFF', pos: 'bc', x: 0, y: 0, start: 10, duration: 5 },
          { id: 'caption', content: 'Dinner on the terrace', size: 56, color: '#FFFFFF', pos: 'bc', x: 0, y: 0, start: 19, duration: 4 },
        ],
      },
      { kind: 'video', id: 'V2', name: 'V2', label: 'Overlay', hidden: false, magnetic: false, clips: overlay.map(([v]) => v) },
      { kind: 'video', id: 'V1', name: 'V1', label: 'Main', hidden: false, magnetic: true, clips: main.map(([v]) => v) },
      { kind: 'audio', id: 'A1', name: 'A1', label: 'Clip audio', muted: false, clips: main.map(([, a]) => a) },
      { kind: 'audio', id: 'A2', name: 'A2', label: 'Overlay audio', muted: false, clips: overlay.map(([, a]) => a) },
    ],
  });
}

/** The selection a fresh editor opens with. */
export const SEED_SELECTION = 'drone-v';
