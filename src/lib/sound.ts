/**
 * The rewards' one sound: a 拍子木 (hyoshigi) wood-block clack, two quick knocks. Synthesized
 * with Web Audio, so there is no audio file to bundle, license or fetch.
 */
let ctx: AudioContext | undefined;

function knock(audio: AudioContext, when: number, pitch: number) {
  // A short burst of noise through a resonant band-pass sounds like hard wood.
  const length = Math.floor(audio.sampleRate * 0.05);
  const buffer = audio.createBuffer(1, length, audio.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  const source = audio.createBufferSource();
  source.buffer = buffer;
  const band = audio.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = pitch;
  band.Q.value = 12;
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.9, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.12);
  source.connect(band).connect(gain).connect(audio.destination);
  source.start(when);
}

/** Plays the clack. Quietly does nothing where Web Audio isn't available. */
export function playClack(): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime + 0.01;
    knock(ctx, now, 1900);
    knock(ctx, now + 0.09, 2100);
  } catch {
    // No audio: the mark still shows.
  }
}
