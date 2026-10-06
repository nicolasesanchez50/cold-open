// Qloo client. Two modes:
//   live    -> `qloo api <command>` (search / insights / tags) plus the
//              event harness `qloo exec <op>` for the remaining workflows.
//              Requires QLOO_API_KEY and QLOO_BASE_URL/QLOO_TRUSTED_BASE_URL
//              pointing at https://hackathon.api.qloo.com .
//   fixture -> reads the recorded responses from fixtures/ so the whole
//              pipeline runs keyless (dev + tests, and the hosted demo).
//
// Mode selection: COLDOPEN_QLOO_MODE=live|fixture, default fixture.
// The client never logs the API key.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { INSIGHTS_TYPE, entitiesToLeads, normalizeEntities } from '../core/qloo_shapes.mjs';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.resolve(__dirname, '../../fixtures');

const QLOO_BIN = process.env.QLOO_BIN || 'qloo';
const MODE = process.env.COLDOPEN_QLOO_MODE || 'fixture';
const TIMEOUT_MS = Number(process.env.COLDOPEN_QLOO_TIMEOUT_MS || 60_000);

export class QlooError extends Error {
  constructor(op, message, { cause } = {}) {
    super(`qloo ${op}: ${message}`);
    this.op = op;
    this.cause = cause;
  }
}

function fixturePath(op, input) {
  // Deterministic fixture name: <op>__<slug>.json where slug derives from the
  // most identifying input field. Falls back to <op>__default.json.
  const key =
    input.query || input.signal || input.entity || input.name || input.brand || 'default';
  let slug = String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  // Disambiguate per-category queries (e.g. recommend across buckets).
  if (input.category) {
    const cat = String(input.category).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    slug = `${slug}__${cat}`;
  }
  return path.join(FIXTURE_DIR, `${op}__${slug}.json`);
}

async function runFixture(op, input) {
  const specific = fixturePath(op, input);
  const fallback = path.join(FIXTURE_DIR, `${op}__default.json`);
  for (const p of [specific, fallback]) {
    try {
      const raw = await readFile(p, 'utf8');
      return JSON.parse(raw);
    } catch (e) {
      if (e.code !== 'ENOENT' && !(e instanceof SyntaxError)) throw e;
    }
  }
  throw new QlooError(op, `no fixture at ${specific} or ${fallback}`);
}

async function runLive(op, input) {
  let stdout;
  try {
    ({ stdout } = await execFileP(
      QLOO_BIN,
      ['exec', op, '--input', JSON.stringify(input)],
      { timeout: TIMEOUT_MS, maxBuffer: 16 * 1024 * 1024 },
    ));
  } catch (e) {
    throw new QlooError(op, e.killed ? 'timed out' : e.message, { cause: e });
  }
  try {
    return JSON.parse(stdout);
  } catch (e) {
    throw new QlooError(op, 'harness returned non-JSON output', { cause: e });
  }
}

// Deterministic REST commands (`qloo api ...`) — the same request shapes the
// browser transport builds by hand, so both paths hit identical endpoints.
async function runApi(args) {
  let stdout;
  try {
    ({ stdout } = await execFileP(QLOO_BIN, ['api', ...args], {
      timeout: TIMEOUT_MS,
      maxBuffer: 16 * 1024 * 1024,
    }));
  } catch (e) {
    throw new QlooError('api', e.killed ? 'timed out' : e.message, { cause: e });
  }
  try {
    return JSON.parse(stdout);
  } catch (e) {
    throw new QlooError('api', '`qloo api` returned non-JSON output', { cause: e });
  }
}

function rowsOf(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.results?.entities)) return payload.results.entities;
  if (Array.isArray(payload?.results?.tags)) return payload.results.tags;
  return [];
}

async function runLiveOp(op, input) {
  if (op === 'search') {
    const limit = Number(input.limit ?? 5);
    const payload = await runApi(['search', '--query', String(input.query ?? ''), '--take', String(limit), '--json']);
    return { results: normalizeEntities(rowsOf(payload)).slice(0, limit) };
  }
  if (op === 'recommend') {
    const filterType = INSIGHTS_TYPE[input.category];
    if (!filterType) throw new QlooError('recommend', `unknown category "${input.category}"`);
    const limit = Number(input.limit ?? 10);
    const payload = await runApi([
      'insights',
      '--type', filterType,
      '--signal-entities', String(input.signal),
      '--take', String(limit),
      '--json',
    ]);
    return { recommendations: entitiesToLeads(rowsOf(payload), input.category).slice(0, limit) };
  }
  return runLive(op, input);
}

export async function qlooExec(op, input) {
  if (typeof input !== 'object' || input === null) {
    throw new QlooError(op, 'input must be an object');
  }
  return MODE === 'live' ? runLiveOp(op, input) : runFixture(op, input);
}

export const qloo = {
  search: (query, limit = 5) => qlooExec('search', { query, limit }),
  findTags: (query, limit = 5) => qlooExec('find_tags', { query, limit }),
  describe: (entity) => qlooExec('describe', { entity }),
  recommend: (input) => qlooExec('recommend', input),
  rank: (input) => qlooExec('rank', input),
  compareAudiences: (input) => qlooExec('compare_audiences', input),
  wherePopular: (input) => qlooExec('where_popular', input),
  trends: (input) => qlooExec('trends', input),
  entityTags: (input) => qlooExec('entity_tags', input),
  audienceDemographics: (input) => qlooExec('audience_demographics', input),
};

export const __mode = MODE;
