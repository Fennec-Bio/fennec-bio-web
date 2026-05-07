// Two-tailed t-distribution critical values at alpha = 0.05.
// Source: standard t-table, df = 1..30.
const T_TABLE_95: Record<number, number> = {
  1: 12.706,  2: 4.303,  3: 3.182,  4: 2.776,  5: 2.571,
  6: 2.447,   7: 2.365,  8: 2.306,  9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
  21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
  26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
}

/**
 * Two-tailed t-critical value at alpha = 0.05 for the given degrees of freedom.
 * df < 1 returns 0 (caller should skip the whisker).
 * df >= 31 returns 1.96 (normal approximation).
 */
export function tCritical95(df: number): number {
  if (df < 1) return 0
  if (df >= 31) return 1.96
  return T_TABLE_95[df] ?? 1.96
}
