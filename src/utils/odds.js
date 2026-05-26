export function americanToDecimal(american) {
  if (american > 0) return american / 100 + 1;
  return 100 / Math.abs(american) + 1;
}

export function decimalToImplied(decimal) {
  return 1 / decimal;
}

export function americanToImplied(american) {
  return decimalToImplied(americanToDecimal(american));
}

export function impliedToAmerican(prob) {
  if (prob >= 0.5) return -Math.round((prob / (1 - prob)) * 100);
  return Math.round(((1 - prob) / prob) * 100);
}

// Remove vig from a set of implied probabilities (multiplicative method)
export function devig(impliedProbs) {
  const total = impliedProbs.reduce((s, p) => s + p, 0);
  return impliedProbs.map(p => p / total);
}

// Compute average no-vig probability from multiple books for one outcome
export function avgNoVigProb(bookOdds) {
  // bookOdds: array of { impliedProbs: [p_outcome1, p_outcome2, ...], targetIdx }
  // Returns the average devigged probability for the target outcome
  if (!bookOdds.length) return null;
  const noVigProbs = bookOdds.map(({ impliedProbs, targetIdx }) => {
    const devigged = devig(impliedProbs);
    return devigged[targetIdx];
  });
  return noVigProbs.reduce((s, p) => s + p, 0) / noVigProbs.length;
}
