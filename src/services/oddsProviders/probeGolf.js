import { probeOddsPapiGolf } from './oddsPapi.js';
import { probeDraftKingsGolf } from './draftKingsGolf.js';

/**
 * Run all golf source probes (steps 1–2 from the migration plan).
 * Safe to call from Settings UI or CLI script.
 */
export async function probeGolfOddsSources({ oddspApiKey, testDraftKings = true } = {}) {
  const results = {
    testedAt: new Date().toISOString(),
    oddspapi: null,
    draftKings: null,
    recommendation: '',
  };

  if (oddspApiKey) {
    results.oddspapi = await probeOddsPapiGolf(oddspApiKey);
  } else {
    results.oddspapi = {
      ok: false,
      error: 'Add an OddsPapi API key in Settings (free tier: oddspapi.io)',
      charlesSchwabFound: false,
    };
  }

  if (testDraftKings) {
    results.draftKings = await probeDraftKingsGolf();
  }

  if (results.oddspapi?.charlesSchwabFound) {
    results.recommendation =
      'OddsPapi has Charles Schwab outrights — enable OddsPapi in Settings and scan.';
  } else if (results.oddspapi?.charlesSchwabListed) {
    results.recommendation =
      'Charles Schwab is listed in OddsPapi but winner prices are not available yet — try again closer to tee-off, or check your API quota.';
  } else if (results.draftKings?.ok) {
    results.recommendation =
      'DraftKings fallback works in your browser — supplemental golf odds will load on scan.';
  } else if (results.oddspapi?.ok) {
    results.recommendation =
      'OddsPapi connected but Charles Schwab not listed yet — check tournament names or try again closer to tee-off.';
  } else {
    results.recommendation =
      'Sign up at oddspapi.io (free tier), paste your key in Settings, then re-run this test.';
  }

  return results;
}

export { probeOddsPapiGolf } from './oddsPapi.js';
export { probeDraftKingsGolf } from './draftKingsGolf.js';
