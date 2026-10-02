export const EQ_FREQUENCIES_HZ = [60, 150, 400, 1000, 2400, 15000] as const;

type Coefficients = { b0: number; b1: number; b2: number; a0: number; a1: number; a2: number };

// Peaking Biquad coefficients from the Web Audio specification, with Q = 1.
// Measure the combined response so adjacent boosted bands get enough headroom.
export function calculateEqHeadroomDb(gains: readonly number[], sampleRate: number): number {
  if (!Number.isFinite(sampleRate) || sampleRate < 8000) {
    return gains.reduce((total, gain) => total + (Number.isFinite(gain) ? Math.max(0, gain) : 0), 0) + 1;
  }

  const nyquist = sampleRate / 2;
  const filters: Coefficients[] = [];
  for (let index = 0; index < EQ_FREQUENCIES_HZ.length; index++) {
    const gain = gains[index] ?? 0;
    if (!Number.isFinite(gain) || gain === 0) continue;
    const frequency = Math.min(EQ_FREQUENCIES_HZ[index], nyquist * 0.95);
    const omega = (2 * Math.PI * frequency) / sampleRate;
    const alpha = Math.sin(omega) / 2;
    const cosOmega = Math.cos(omega);
    const A = Math.pow(10, gain / 40);
    filters.push({
      b0: 1 + alpha * A,
      b1: -2 * cosOmega,
      b2: 1 - alpha * A,
      a0: 1 + alpha / A,
      a1: -2 * cosOmega,
      a2: 1 - alpha / A,
    });
  }
  if (!filters.length) return 0;

  const highestFrequency = Math.min(20000, nyquist * 0.98);
  let peakDb = 0;
  for (let point = 0; point < 128; point++) {
    const frequency = 20 * Math.pow(highestFrequency / 20, point / 127);
    const theta = (2 * Math.PI * frequency) / sampleRate;
    const cos1 = Math.cos(theta);
    const sin1 = Math.sin(theta);
    const cos2 = Math.cos(2 * theta);
    const sin2 = Math.sin(2 * theta);
    let combinedDb = 0;

    for (const filter of filters) {
      const numeratorReal = filter.b0 + filter.b1 * cos1 + filter.b2 * cos2;
      const numeratorImag = -filter.b1 * sin1 - filter.b2 * sin2;
      const denominatorReal = filter.a0 + filter.a1 * cos1 + filter.a2 * cos2;
      const denominatorImag = -filter.a1 * sin1 - filter.a2 * sin2;
      const numeratorPower = numeratorReal * numeratorReal + numeratorImag * numeratorImag;
      const denominatorPower = denominatorReal * denominatorReal + denominatorImag * denominatorImag;
      combinedDb += 10 * Math.log10(numeratorPower / denominatorPower);
    }
    peakDb = Math.max(peakDb, combinedDb);
  }
  return peakDb > 0 ? peakDb + 0.75 : 0;
}
