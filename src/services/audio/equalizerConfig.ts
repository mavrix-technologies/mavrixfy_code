/** LastWave EqualizerPreferences: ISO bands, safe gain limits and preset curves. */
export const EQ_FREQUENCIES_HZ = [25, 40, 63, 100, 160, 250, 400, 630, 1000, 1600, 2500, 4000, 6300, 10000, 16000] as const;
export const EQ_MAX_GAIN_DB = 8;
export const EQ_Q = Math.SQRT2;
export const EQUALIZER_BANDS = EQ_FREQUENCIES_HZ.map(hz => `${hz}Hz`);
export const FLAT_EQUALIZER = Object.fromEntries(EQUALIZER_BANDS.map(key => [key, 0]));
export interface EqualizerPreset { id: string; name: string; bands: Record<string, number> }
const preset = (id: string, name: string, gains: number[]): EqualizerPreset => ({
  id, name, bands: Object.fromEntries(EQUALIZER_BANDS.map((key, i) => [key, gains[i]])),
});
export const EQUALIZER_PRESETS: EqualizerPreset[] = [
  preset("flat", "Default", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
  preset("studio-master", "Studio Master", [2.6, 2.8, 2.2, 0.6, -1.8, -2.6, -1.2, 0, 1.2, 2.4, 3.6, 4, 4.2, 4.5, 4.8]),
  preset("acoustic", "Acoustic", [3.0, 2.5, 2.0, 1.5, 0.5, 1.0, 1.5, 2.0, 2.0, 1.5, 1.0, 1.0, 1.0, 1.5, 1.5]),
  preset("vocal-clarity", "Vocal Clarity", [-1.5, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0, 3.0, 3.5, 3.0, 2.5, 2.0, 1.5, 1.5, 1.0]),
  preset("classical", "Classical", [3.0, 2.5, 2.0, 1.5, 0.5, 0.0, 0.0, 0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.0]),
  preset("jazz", "Jazz", [2.5, 2.0, 1.5, 1.0, 0.0, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 2.0, 2.5, 2.5, 2.5]),
  preset("rock", "Rock", [4.0, 3.5, 3.0, 1.5, 0.0, -1.0, -1.0, -0.5, 0.5, 1.5, 2.5, 3.0, 3.5, 4.0, 4.0]),
  preset("pop", "Pop", [-1.0, -0.5, 0.0, 1.0, 1.5, 2.0, 2.0, 1.5, 1.0, 0.5, 0.5, 1.0, 1.5, 2.0, 2.5]),
  preset("treble-air", "Treble Air", [0.0, 0.0, 0.0, -0.5, -0.5, -0.5, 0.0, 0.5, 1.0, 1.5, 2.0, 3.0, 3.5, 4.5, 5.0]),
  preset("deep-bass-clean", "Deep Bass Clean", [5.0, 4.5, 3.5, 2.5, 1.0, 0.0, -0.5, -0.5, 0.0, 0.0, 0.0, 0.0, 0.5, 0.5, 0.5]),
  preset("electronic", "Electronic", [4.5, 4.0, 3.0, 2.0, 0.5, -0.5, 0.0, 1.0, 2.0, 2.5, 2.5, 2.5, 3.0, 3.5, 4.0]),
  preset("r-b", "R&B", [5.0, 4.5, 3.5, 2.0, 1.0, -0.5, -1.0, -0.5, 0.5, 1.5, 2.0, 2.5, 3.0, 3.0, 3.0]),
 ];
export function normalizeEqualizer(raw: Record<string, number> = {}): Record<string, number> {
  if (!raw || typeof raw !== "object") raw = {};
  const legacy = [[60,"60Hz"],[150,"150Hz"],[400,"400Hz"],[1000,"1KHz"],[2400,"2.4KHz"],[15000,"15KHz"]] as const;
  const modern = EQUALIZER_BANDS.some(key => key !== "400Hz" && key in raw);
  return Object.fromEntries(EQ_FREQUENCIES_HZ.map((hz, i) => {
    const nearest = legacy.reduce((best, band) => Math.abs(Math.log(hz / band[0])) < Math.abs(Math.log(hz / best[0])) ? band : best);
    const value = modern ? raw[EQUALIZER_BANDS[i]] : raw[nearest[1]];
    return [EQUALIZER_BANDS[i], Number.isFinite(value) ? Math.max(-EQ_MAX_GAIN_DB, Math.min(EQ_MAX_GAIN_DB, value)) : 0];
  }));
}
export function detectMatchingPreset(bands: Record<string, number>): string | null {
  return EQUALIZER_PRESETS.find(p => EQUALIZER_BANDS.every(key => Math.abs((bands[key] || 0) - p.bands[key]) < 0.05))?.id ?? null;
}
