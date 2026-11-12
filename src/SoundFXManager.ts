// src/SoundFXManager.ts
/**
 * Procedural Web Audio SFX Engine for Fantasy Auto-Battler.
 * Zero external audio assets required; produces crisp, punchy, low-latency sound effects
 * directly via Web Audio API synthesis. Works seamlessly in Web & Capacitor Android APK.
 */

export class SoundFXManager {
  private static instance: SoundFXManager | null = null;
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isMuted: boolean = false;
  private volume: number = 0.55;

  private constructor() {
    // Lazy initialize on first user interaction to comply with browser autoplay policies
  }

  public static getInstance(): SoundFXManager {
    if (!SoundFXManager.instance) {
      SoundFXManager.instance = new SoundFXManager();
    }
    return SoundFXManager.instance;
  }

  private initContextIfNeeded(): boolean {
    if (this.isMuted) return false;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return false;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return true;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(
        this.isMuted ? 0 : this.volume,
        this.ctx.currentTime
      );
    }
    return this.isMuted;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.masterGain && this.ctx && !this.isMuted) {
      this.masterGain.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  /**
   * 1. 묵직한 유닛 배치 타격음 (Deep Thud & Hex Lock)
   * 보드나 대기석에 기물을 놓을 때 쿵 하고 안착되는 묵직한 베이스 충격음
   */
  public playPlaceThud(): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Sub-bass sine kick: 130Hz -> 38Hz fast pitch drop
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + 0.16);

    oscGain.gain.setValueAtTime(0.7, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    // Stone click noise burst
    const clickOsc = this.ctx.createOscillator();
    const clickGain = this.ctx.createGain();
    clickOsc.type = 'triangle';
    clickOsc.frequency.setValueAtTime(320, now);
    clickOsc.frequency.exponentialRampToValueAtTime(80, now + 0.05);
    clickGain.gain.setValueAtTime(0.4, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    osc.connect(oscGain);
    clickOsc.connect(clickGain);
    oscGain.connect(this.masterGain);
    clickGain.connect(this.masterGain);

    osc.start(now);
    clickOsc.start(now);
    osc.stop(now + 0.24);
    clickOsc.stop(now + 0.07);
  }

  /**
   * 2. 기물 집기 및 카드 터치음 (Crisp Mechanical Snap)
   */
  public playPickup(): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(420, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + 0.07);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.1);
  }

  /**
   * 3. 상점 카드 넘기기 / 리롤 효과음 (Card Reroll Swish)
   */
  public playReroll(): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    // Noise swoosh
    const bufferSize = this.ctx.sampleRate * 0.18;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(2200, now + 0.09);
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.18);
    filter.Q.value = 3.0;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
  }

  /**
   * 4. 황금 코인 짤랑 소리 (Coin Clink) - 구매, 판매, 골드 획득 시
   */
  public playCoin(pitchMod: number = 1.0): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const baseFreq = 1860 * pitchMod;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sine';
    osc2.type = 'triangle';
    osc1.frequency.setValueAtTime(baseFreq, now);
    osc2.frequency.setValueAtTime(baseFreq * 1.51, now);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.3);
    osc2.stop(now + 0.3);
  }

  private lastSlashTime: number = 0;
  private lastSpellTime: number = 0;

  /**
   * 5. 전투 일반 타격 / 칼 베는 소리 (Blade Slash / Impact)
   */
  public playSlash(isCrit: boolean = false): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (!isCrit && now - this.lastSlashTime < 0.07) return;
    this.lastSlashTime = now;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isCrit ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isCrit ? 480 : 340, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + (isCrit ? 0.22 : 0.12));

    gain.gain.setValueAtTime(isCrit ? 0.6 : 0.32, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isCrit ? 0.24 : 0.14));

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + (isCrit ? 0.25 : 0.15));
  }

  /**
   * 6. 마법 스킬 폭발음 (Arcane Magic Boom / Chime)
   */
  public playMagicSpell(): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    if (now - this.lastSpellTime < 0.1) return;
    this.lastSpellTime = now;

    // Resonant sweep
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.38);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.Q.value = 5.0;

    gain.gain.setValueAtTime(0.45, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.44);
  }

  /**
   * 7. 라운드 전투 개시 전쟁 나팔 (Combat Warhorn)
   */
  public playCombatHorn(): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';
    // Brass fifth interval (D2 & A2)
    osc1.frequency.setValueAtTime(73.4, now);
    osc2.frequency.setValueAtTime(110.0, now);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(250, now);
    filter.frequency.linearRampToValueAtTime(650, now + 0.4);
    filter.frequency.exponentialRampToValueAtTime(180, now + 0.95);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.48, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 1.0);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 1.05);
    osc2.stop(now + 1.05);
  }

  /**
   * 8. 레벨업 & 3성 합성 팡파르 (Triumphant Chord)
   */
  public playFanfare(isThreeStar: boolean = false): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;
    const notes = isThreeStar
      ? [261.6, 329.6, 392.0, 523.2, 659.2] // C major arpeggio
      : [329.6, 440.0, 554.4];

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.masterGain) return;
      const noteTime = now + idx * 0.08;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.35, noteTime + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.55);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(noteTime);
      osc.stop(noteTime + 0.6);
    });
  }

  /**
   * 9. 증강체 획득 웅장한 종소리 (Augment Arcane Chime)
   */
  public playAugmentSelect(): void {
    if (!this.initContextIfNeeded() || !this.ctx || !this.masterGain) return;
    const now = this.ctx.currentTime;

    const freqs = [587.3, 880.0, 1174.6]; // D minor mystery chord
    freqs.forEach((f) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      osc.connect(gain);
      gain.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + 0.9);
    });
  }
}

export const soundFX = SoundFXManager.getInstance();
