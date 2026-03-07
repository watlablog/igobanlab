export type InfluenceBucket = -3 | -2 | -1 | 0 | 1 | 2 | 3;

export const INFLUENCE_THRESHOLD_WEAK = 0.15;
export const INFLUENCE_THRESHOLD_MEDIUM = 0.33;
export const INFLUENCE_THRESHOLD_STRONG = 0.66;

export const clampInfluence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
};

export const quantizeInfluence = (value: number): InfluenceBucket => {
  const v = clampInfluence(value);
  const abs = Math.abs(v);

  if (abs < INFLUENCE_THRESHOLD_WEAK) return 0;
  if (abs < INFLUENCE_THRESHOLD_MEDIUM) return v > 0 ? 1 : -1;
  if (abs < INFLUENCE_THRESHOLD_STRONG) return v > 0 ? 2 : -2;
  return v > 0 ? 3 : -3;
};

export const markerLabelFromInfluence = (value: number): string | null => {
  const bucket = quantizeInfluence(value);
  if (bucket === 0) return null;
  const strength = Math.abs(bucket);
  return bucket > 0 ? `influence-black-${strength}` : `influence-white-${strength}`;
};
