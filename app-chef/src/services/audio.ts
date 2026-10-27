// Generador nativo de audio Web Audio API de alto volumen para notificaciones de cocina (KDS)
class AudioAlertService {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;
  public volume: number = 0.95; // Volumen alto predeterminado (95%)

  constructor() {
    // Inicializar y reactivar contexto de audio con la primera interacción del usuario
    if (typeof window !== 'undefined') {
      const unlockAudio = () => {
        this.initContext();
        if (this.ctx && this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('touchstart', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      };
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
    }
  }

  private initContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Toca un timbre de campana de cocina con armónicos enriquecidos (fundamental + sobretono)
   * Diseñado para cortar a través del ruido ambiental de cocina.
   */
  private playBellStrike(freq: number, startTime: number, duration: number, masterGain: GainNode) {
    if (!this.ctx) return;

    // 1. Oscilador fundamental (cuerpo profundo)
    const oscFund = this.ctx.createOscillator();
    const gainFund = this.ctx.createGain();
    oscFund.type = 'sine';
    oscFund.frequency.setValueAtTime(freq, startTime);
    gainFund.gain.setValueAtTime(0.7, startTime);
    gainFund.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    oscFund.connect(gainFund);
    gainFund.connect(masterGain);

    // 2. Oscilador armónico de sobretono (brillo metálico de campana de servicio)
    const oscHarm = this.ctx.createOscillator();
    const gainHarm = this.ctx.createGain();
    oscHarm.type = 'triangle'; // Agrega armónicos impares cálidos y penetrantes
    oscHarm.frequency.setValueAtTime(freq * 2, startTime);
    gainHarm.gain.setValueAtTime(0.35, startTime);
    gainHarm.gain.exponentialRampToValueAtTime(0.001, startTime + Math.min(duration, 0.45));
    oscHarm.connect(gainHarm);
    gainHarm.connect(masterGain);

    oscFund.start(startTime);
    oscFund.stop(startTime + duration);
    oscHarm.start(startTime);
    oscHarm.stop(startTime + duration);
  }

  /**
   * Timbre de comanda de cocina de alto volumen y doble ráfaga:
   * Secuencia: Sol5 (784Hz) -> Do6 (1046Hz) -> Mi6 (1318Hz) [repite a los 0.65s]
   */
  public playNewOrderChime() {
    if (!this.enabled) return;

    // Vibración háptica en celulares y tablets Android
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate([400, 150, 400, 150, 600]);
      } catch (_) {}
    }

    try {
      this.initContext();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const master = this.ctx.createGain();
      master.gain.setValueAtTime(Math.min(1.0, Math.max(0.1, this.volume)), now);
      master.connect(this.ctx.destination);

      // Ráfaga 1: Ding - Ding - Dong!
      this.playBellStrike(784.00,  now,        0.5, master); // Sol 5
      this.playBellStrike(1046.50, now + 0.15, 0.6, master); // Do 6
      this.playBellStrike(1318.51, now + 0.32, 1.1, master); // Mi 6 (resonante)

      // Ráfaga 2 de confirmación a los 0.7s para asegurar que el cocinero lo escuche
      this.playBellStrike(784.00,  now + 0.70, 0.5, master);
      this.playBellStrike(1046.50, now + 0.85, 0.6, master);
      this.playBellStrike(1318.51, now + 1.02, 1.4, master);
    } catch (e) {
      console.warn('[AudioAlert] Error reproduciendo chime:', e);
    }
  }
}

export const audioAlert = new AudioAlertService();
