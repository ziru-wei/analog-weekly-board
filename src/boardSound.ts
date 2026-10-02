export type BoardSoundKind = 'paper' | 'label' | 'launch' | 'place' | 'pin' | 'snap' | 'pluck' | 'tie' | 'retract' | 'tape' | 'tear';
const MASTER_VOLUME = .28;

/** Soft material textures with fixed gain: quiet details are never peak-normalized into impacts. */
export function makeBoardSound(context: BaseAudioContext, kind: BoardSoundKind) {
  const duration = { paper: .14, label: .075, launch: .18, place: .08, pin: .16, snap: .08, pluck: .22, tie: .16, retract: .19, tape: .45, tear: .2 }[kind];
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
  const data = buffer.getChannelData(0), variation = .96 + Math.random() * .08;
  const volume = kind === 'pin' || kind === 'tape' || kind === 'tear' ? 1 : 2;
  const brush = (time: number, start: number, length: number) => {
    const phase = (time - start) / length;
    return phase <= 0 || phase >= 1 ? 0 : Math.sin(Math.PI * phase) ** 2;
  };
  const paperSound = kind === 'label' || kind === 'paper' || kind === 'launch' || kind === 'place';
  let low = 0, soft = 0, paperSmooth = 0, grain = .5, grainTarget = .5;
  const lowMix = 1 - Math.exp(-2 * Math.PI * (paperSound ? 500 : 850) / context.sampleRate);
  const softMix = 1 - Math.exp(-2 * Math.PI * (paperSound ? 1700 : 3200) / context.sampleRate);
  const grainMix = 1 - Math.exp(-1 / (.014 * context.sampleRate));
  for (let i = 0; i < data.length; i++) {
    const t = i / context.sampleRate, noise = Math.random() * 2 - 1;
    low += lowMix * (noise - low); soft += softMix * (noise - soft);
    const fibre = soft - low;
    paperSmooth += softMix * (fibre - paperSmooth);
    // Irregular, smoothly varying texture avoids the old periodic buzzing.
    if (i % Math.round(context.sampleRate * .023) === 0) grainTarget = .3 + Math.random() * .7;
    grain += grainMix * (grainTarget - grain);
    let value = 0;
    if (kind === 'paper') {
      value = paperSmooth * .08 * brush(t, 0, .14);
    } else if (kind === 'label') {
      const attack = Math.sin(Math.min(1, t / .008) * Math.PI / 2) ** 2;
      value = paperSmooth * .11 * attack * Math.exp(-Math.max(0, t - .008) / .018);
    } else if (kind === 'launch') {
      value = paperSmooth * .08 * brush(t, 0, .18);
    } else if (kind === 'place') {
      value = paperSmooth * .045 * brush(t, 0, .08);
    } else if (kind === 'pin') {
      value = fibre * .15 * (brush(t, 0, .045) + .22 * brush(t, .035, .095));
    } else if (kind === 'snap') {
      value = .014 * Math.sin(t * Math.PI * 2 * 190) * brush(t, 0, .08);
    } else if (kind === 'tape') {
      value = fibre * .065 * brush(t, 0, .45) * grain;
    } else if (kind === 'tear') {
      value = fibre * .05 * (brush(t, 0, .13) + .3 * brush(t, .07, .13)) * grain;
    } else if (kind === 'retract') {
      const phase = Math.PI * 2 * (145 * t + 2.5 * (1 - Math.exp(-t / .04)));
      value = .081 * Math.sin(phase) * brush(t, 0, .19);
    } else {
      // Rounded, low fibre resonance with only a faint second harmonic.
      const tied = kind === 'tie', frequency = (tied ? 190 : 175) * variation;
      const phase = Math.PI * 2 * (frequency * t + .12 * (1 - Math.exp(-t / .035)));
      value = (tied ? .117 : .032) * (1 - Math.exp(-t / .018))
        * (Math.sin(phase) * Math.exp(-t / .045)
          + .08 * Math.sin(phase * 2) * Math.exp(-t / .025));
    }
    data[i] = value * volume * Math.min(1, (duration - t) / .025);
  }
  return buffer;
}

export class BoardSound {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private enabled = true;
  private voices = new Set<AudioBufferSourceNode>();
  private lastPlayed = new Map<BoardSoundKind, number>();

  unlock() {
    if (!this.enabled || document.hidden) return;
    try {
      if (!this.context) {
        this.context = new AudioContext({ latencyHint: 'interactive' });
        this.output = this.context.createGain();
        this.output.gain.value = MASTER_VOLUME;
        this.output.connect(this.context.destination);
      }
      if (this.context.state !== 'running' && this.context.state !== 'closed') void this.context.resume().catch(() => {});
    } catch { /* Sound is optional when browser audio is unavailable. */ }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
    if (this.output && this.context) this.output.gain.setTargetAtTime(enabled ? MASTER_VOLUME : 0, this.context.currentTime, .012);
  }

  play(kind: BoardSoundKind) {
    const context = this.context;
    if (!this.enabled || !context || context.state !== 'running' || document.hidden || !this.output) return;
    const now = context.currentTime;
    if (now - (this.lastPlayed.get(kind) ?? -Infinity) < (kind === 'snap' ? .16 : .075) || this.voices.size >= 6) return;
    this.lastPlayed.set(kind, now);
    const source = context.createBufferSource();
    source.buffer = makeBoardSound(context, kind);
    source.connect(this.output); this.voices.add(source);
    source.onended = () => { source.disconnect(); this.voices.delete(source); };
    source.start();
  }

  stop() {
    for (const source of this.voices) source.stop();
    this.voices.clear();
  }

  dispose() {
    this.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null; this.output = null; this.lastPlayed.clear();
  }
}
