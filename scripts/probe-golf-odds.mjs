#!/usr/bin/env node
/**
 * CLI probe for golf odds sources (steps 1–2 of the multi-provider plan).
 *
 * Usage:
 *   ODDS_PAPI_API_KEY=your_key node scripts/probe-golf-odds.mjs
 *   node scripts/probe-golf-odds.mjs --key=your_key
 */
import { probeGolfOddsSources } from '../src/services/oddsProviders/probeGolf.js';

function getKey() {
  if (process.env.ODDS_PAPI_API_KEY) return process.env.ODDS_PAPI_API_KEY;
  const arg = process.argv.find(a => a.startsWith('--key='));
  return arg ? arg.split('=').slice(1).join('=') : '';
}

const oddspApiKey = getKey();

console.log('=== Golf Odds Source Probe ===\n');
if (!oddspApiKey) {
  console.log('No OddsPapi key — set ODDS_PAPI_API_KEY or pass --key=...\n');
  console.log('Sign up free: https://oddspapi.io\n');
}

const result = await probeGolfOddsSources({
  oddspApiKey,
  testDraftKings: !process.argv.includes('--no-dk'),
});

console.log(JSON.stringify(result, null, 2));
console.log('\nRecommendation:', result.recommendation);

process.exit(result.oddspapi?.charlesSchwabFound || result.draftKings?.ok ? 0 : 1);
