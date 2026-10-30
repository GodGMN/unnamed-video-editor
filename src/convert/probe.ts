import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';

export interface SourceInfo {
  container: string;
  /** Human label such as "HEVC Main 10". */
  videoCodec: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  hasAudio: boolean;
  /** Whether WebCodecs in this browser can decode the video track. */
  decodable: boolean;
}

const FORMAT_LABELS: Record<string, string> = {
  'QuickTime File Format': 'MOV', MP4: 'MP4', Matroska: 'MKV', WebM: 'WebM', 'MPEG Transport Stream': 'MPEG-TS',
};

const CODEC_LABELS: Record<string, string> = {
  avc: 'H.264', hevc: 'HEVC', vp8: 'VP8', vp9: 'VP9', av1: 'AV1',
};

/** Reads container metadata without decoding, so it works for codecs the browser can't play. */
export async function probeSource(file: File): Promise<SourceInfo> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error('This file has no video track.');
    const [format, codec, codecString, width, height, stats, duration, audio, decodable] = await Promise.all([
      input.getFormat(),
      video.getCodec(),
      video.getCodecParameterString(),
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.computePacketStats(120),
      input.computeDuration(),
      input.getPrimaryAudioTrack(),
      video.canDecode().catch(() => false),
    ]);
    let videoCodec = codec ? CODEC_LABELS[codec] ?? codec.toUpperCase() : 'Unknown codec';
    // hvc1.2.* / hev1.2.* is general_profile_idc 2, i.e. Main 10.
    if (codec === 'hevc' && /^(hvc1|hev1)\.2\./.test(codecString ?? '')) videoCodec += ' Main 10';
    return {
      container: FORMAT_LABELS[format.name] ?? format.name,
      videoCodec,
      width,
      height,
      fps: Math.round(stats.averagePacketRate * 100) / 100,
      duration,
      hasAudio: audio !== null,
      decodable,
    };
  } finally {
    input.dispose();
  }
}
