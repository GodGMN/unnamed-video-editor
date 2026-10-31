declare module 'signalsmith-stretch' {
  /** Resolves to an AudioWorkletNode with the methods typed in `playback/stretch.ts`. */
  const SignalsmithStretch: (context: BaseAudioContext, options?: AudioWorkletNodeOptions) => Promise<AudioWorkletNode>;
  export default SignalsmithStretch;
}
