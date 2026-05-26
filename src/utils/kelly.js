/**
 * Kelly Criterion for a binary Polymarket market.
 *
 * Buying YES at price P (0–1):
 *   - Win:  net profit = (1-P) per share  →  b = (1-P)/P
 *   - Loss: net loss   = P per share
 *
 * Full Kelly% = (b*p - q) / b  = (p - P) / (1 - P)
 * where p = true probability, q = 1 - p
 *
 * For buying NO at price Q = 1-P:
 *   - b_no = P / (1-P)
 *   - Kelly_no = (p_no - Q) / (1 - Q)  where p_no = 1 - true_prob
 */
export function kellyFraction({ trueProb, marketPrice }) {
  const p = trueProb;
  const P = marketPrice;

  if (P <= 0 || P >= 1 || p <= 0 || p >= 1) return 0;

  const k = (p - P) / (1 - P);
  return Math.max(0, k);
}

export function kellySizingYes({ trueProb, marketPrice, bankroll, fraction = 1 }) {
  const k = kellyFraction({ trueProb, marketPrice });
  return {
    kellyPct: k,
    adjustedPct: k * fraction,
    betSize: k * fraction * bankroll,
  };
}

export function kellySizingNo({ trueProb, marketPrice, bankroll, fraction = 1 }) {
  const trueNo = 1 - trueProb;
  const noPrice = 1 - marketPrice;
  const k = kellyFraction({ trueProb: trueNo, marketPrice: noPrice });
  return {
    kellyPct: k,
    adjustedPct: k * fraction,
    betSize: k * fraction * bankroll,
  };
}

/**
 * Returns EV% for buying YES at marketPrice given trueProb.
 * EV% = (trueProb / marketPrice - 1) * 100
 */
export function evPercent(trueProb, marketPrice) {
  if (marketPrice <= 0) return 0;
  return (trueProb / marketPrice - 1) * 100;
}
