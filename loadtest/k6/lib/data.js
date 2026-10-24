// Test accounts and ids. Both files are produced from the seeded load-test
// database only: scripts/mint-tokens.sh (tokens made the way
// apps/api/bench/mint-tokens.mjs makes them, never real users) and
// scripts/discover.mjs (ids found through the API).
//
// SharedArray = one copy in memory for all VUs. Each list is its own array
// and is read by index, so a VU never parses the whole file.
import { SharedArray } from 'k6/data';
import { SHARD, SHARDS } from './env.js';

const load = (file, key) =>
  new SharedArray(`${file}:${key}`, () => {
    const path = __ENV[file];
    if (!path) return [];
    const j = JSON.parse(open(path));
    return Array.isArray(j[key]) ? j[key] : [];
  });

const C = load('TOKENS_FILE', 'clients');
const A = load('TOKENS_FILE', 'attorneys');
export const ADM = load('TOKENS_FILE', 'admins');
const CV = load('FIXTURES_FILE', 'conversations');
export const POSTS = load('FIXTURES_FILE', 'posts');
export const CASES = load('FIXTURES_FILE', 'cases');
export const USERNAMES = load('FIXTURES_FILE', 'usernames');
export const ATTORNEY_IDS = load('FIXTURES_FILE', 'attorneyIds');
export const ASSETS = load('FIXTURES_FILE', 'assets');
export const LANGS = load('FIXTURES_FILE', 'langs');

// A generator uses every SHARDS-th item starting at SHARD, so two generators
// never push the same person over the API's per-user limit (100 / minute).
const nth = (arr) => (rand) => {
  const n = Math.floor((arr.length - SHARD + SHARDS - 1) / SHARDS);
  if (n <= 0) return undefined;
  return arr[SHARD + Math.floor(rand() * n) * SHARDS];
};
export const clientToken = nth(C);
export const attorneyToken = nth(A);
export const conversation = nth(CV); // { id, attorney, client } (tokens of both members)
export const rnd = Math.random;
export const pick = (arr) => (arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined);
export const counts = () => ({ clients: C.length, attorneys: A.length, conversations: CV.length, admins: ADM.length });
