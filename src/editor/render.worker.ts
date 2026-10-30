import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import type { VideoSample } from 'mediabunny';
import { clipEnd, videoTracks } from './model';
import type { Project, VideoClip } from './model';
import type { RenderReply, RenderRequest } from './renderProtocol';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<RenderRequest>) => void) | null;
  postMessage(message: RenderReply, transfer?: Transferable[]): void;
};
let project: Project;
let files: Record<string, File>;
const inputs = new Map<string, Input>();
const streams = new Map<string, AsyncGenerator<VideoSample | null, void, unknown>>();

function* timestamps(clip: VideoClip) {
  for (let i = Math.max(0, Math.ceil(clip.start * project.output.fps)); i / project.output.fps < clipEnd(clip); i++) {
    yield clip.inS + i / project.output.fps - clip.start;
  }
}

async function frame(time: number) {
  const frames: { clipId: string; image: ImageBitmap }[] = [];
  try {
    for (const track of videoTracks(project)) {
      if (track.hidden) continue;
      for (const clip of track.clips) {
        // Stills are decoded once on the main thread.
        if (time < clip.start || time >= clipEnd(clip) || project.media[clip.mediaId]?.still) continue;
        let stream = streams.get(clip.id);
        if (!stream) {
          const input = new Input({ source: new BlobSource(files[clip.mediaId]), formats: ALL_FORMATS });
          inputs.set(clip.id, input);
          const video = await input.getPrimaryVideoTrack();
          if (!video || !await video.canDecode()) throw new Error(`Cannot decode video from "${project.media[clip.mediaId]?.name}". Convert it to MP4 first.`);
          stream = new VideoSampleSink(video).samplesAtTimestamps(timestamps(clip));
          streams.set(clip.id, stream);
        }
        const { value: sample } = await stream.next();
        if (!sample) throw new Error(`No video frame at ${time.toFixed(3)} s for "${project.media[clip.mediaId]?.name}".`);
        try {
          const canvas = new OffscreenCanvas(sample.displayWidth, sample.displayHeight);
          sample.draw(canvas.getContext('2d')!, 0, 0);
          frames.push({ clipId: clip.id, image: canvas.transferToImageBitmap() });
        } finally { sample.close(); }
      }
    }
    for (const [id, input] of inputs) {
      const clip = videoTracks(project).flatMap((t) => t.clips).find((c) => c.id === id)!;
      if (time >= clipEnd(clip)) {
        await streams.get(id)?.return();
        streams.delete(id); input.dispose(); inputs.delete(id);
      }
    }
    scope.postMessage({ type: 'frame', frames }, frames.map((f) => f.image));
  } catch (error) {
    frames.forEach((f) => f.image.close());
    throw error;
  }
}

scope.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      project = data.project; files = data.files;
      scope.postMessage({ type: 'ready' });
    } else await frame(data.time);
  } catch (error) {
    scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};
