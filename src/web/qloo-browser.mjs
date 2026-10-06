// Browser Qloo client — same op surface as src/qloo/client.mjs, over fetch.
//
// Two modes, selected by whether an event API key is configured:
//   live     -> GET https://hackathon.api.qloo.com/... with the `X-Api-Key`
//               header. The hackathon endpoint answers with
//               `access-control-allow-origin: *` and `allow-headers: *`
//               (verified by probe), so the browser may call it directly —
//               no backend proxy is needed for the hosted demo.
//   fixture  -> fetches the responses recorded in fixtures/ by
//               scripts/record_fixtures.py (captured from the live hackathon
//               API, field selection only) so the page runs keyless. The UI
//               labels them RECORDED — real Qloo output, not a live call,
//               and definitely not invented numbers.
//
// Request shapes mirror the Node transport (`qloo api`) exactly:
//   find_tags  -> GET /v2/tags?filter.query=...&feature.semantic_search=true&take=...
//   recommend  -> GET /v2/insights?filter.type=urn:entity:...&signal.interests.entities=...
//                 (GET only; parameters belong in the query string)
//   search     -> GET /search?query=...
//
// The signal is an ENTITY id, not a tag id: tag signals only move the
// affinity needle when the tag is graph-connected to the requested entity
// type — for most subject/type pairs the API answers with the same default
// list and a constant affinity (0.7649962877984056, observed 2026-10-06),
// so every subject looked identical. Entity signals return subject-dependent
// results with varying affinity across all supported types.

import {
  INSIGHTS_TYPE,
  SUPPORTED_INSIGHTS_TYPES,
  compactTag,
  entitiesToLeads,
  normalizeEntities,
} from '../core/qloo_shapes.mjs';

export { INSIGHTS_TYPE, SUPPORTED_INSIGHTS_TYPES };

const BASE = 'https://hackathon.api.qloo.com';
const FIXTURE_BASE = 'fixtures/';
const KEY_STORAGE = 'coldopen.qloo_api_key';

export class QlooError extends Error {
  constructor(op, message, { cause } = {}) {
    super(`qloo ${op}: ${message}`);
    this.op = op;
    this.cause = cause;
  }
}

function readKey() {
  try {
    const fromUrl = new URLSearchParams(globalThis.location?.search ?? '').get('key');
    if (fromUrl) {
      globalThis.localStorage?.setItem(KEY_STORAGE, fromUrl);
      return fromUrl;
    }
    return globalThis.localStorage?.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function setApiKey(key) {
  try {
    if (key) globalThis.localStorage?.setItem(KEY_STORAGE, key);
    else globalThis.localStorage?.removeItem(KEY_STORAGE);
  } catch {
    /* storage disabled — the key simply will not persist */
  }
}

export function apiKey() {
  return readKey();
}

export function mode() {
  return readKey() ? 'live' : 'fixture';
}

function queryString(params) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) v.forEach((item) => qs.append(k, item));
    else qs.append(k, String(v));
  }
  const s = qs.toString();
  return s ? `?${s}` : '';
}

async function liveGet(op, path, params) {
  const key = readKey();
  if (!key) throw new QlooError(op, 'no API key configured');
  let res;
  try {
    res = await fetch(`${BASE}${path}${queryString(params)}`, {
      headers: { 'X-Api-Key': key, Accept: 'application/json' },
    });
  } catch (e) {
    throw new QlooError(op, `network error: ${e.message}`, { cause: e });
  }
  const text = await res.text();
  if (!res.ok) {
    throw new QlooError(op, `HTTP ${res.status} ${text.slice(0, 300)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new QlooError(op, 'non-JSON response from the Qloo API', { cause: text });
  }
}

function fixtureName(op, input) {
  // Same deterministic naming as src/qloo/client.mjs so both transports
  // resolve the same recorded file.
  const key =
    input.query || input.signal || input.entity || input.name || input.brand || 'default';
  let slug = String(key).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  if (input.category) {
    const cat = String(input.category).toLowerCase().replace(/[^a-z0-9]+/g, '_');
    slug = `${slug}__${cat}`;
  }
  return `${op}__${slug}.json`;
}

async function fixtureGet(op, input) {
  const candidates = [
    `${FIXTURE_BASE}${fixtureName(op, input)}`,
    `${FIXTURE_BASE}${op}__default.json`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch {
      /* try the next candidate */
    }
  }
  throw new QlooError(op, `no recorded fixture for ${JSON.stringify(input)}`);
}

function resultArray(response, key) {
  const results = response?.results;
  if (Array.isArray(results)) return results;
  if (results && typeof results === 'object') return results[key] ?? [];
  return response?.[key] ?? [];
}

export const browserQloo = {
  async search(query, limit = 5) {
    if (mode() === 'live') {
      const res = await liveGet('search', '/search', { query, take: limit });
      return { results: normalizeEntities(res?.results ?? res).slice(0, limit) };
    }
    return fixtureGet('search', { query, limit });
  },

  async findTags(query, limit = 5) {
    if (mode() === 'live') {
      const res = await liveGet('find_tags', '/v2/tags', {
        'filter.query': query,
        'feature.semantic_search': 'true',
        take: limit,
      });
      return { results: resultArray(res, 'tags').map(compactTag).filter(Boolean).slice(0, limit) };
    }
    return fixtureGet('find_tags', { query, limit });
  },

  async recommend({ signal, category, limit = 10, query }) {
    if (mode() === 'live') {
      const filterType = INSIGHTS_TYPE[category];
      if (!filterType) throw new QlooError('recommend', `unknown category "${category}"`);
      const res = await liveGet('recommend', '/v2/insights', {
        'filter.type': filterType,
        'signal.interests.entities': signal,
        take: limit,
        'feature.explainability': 'true',
      });
      return {
        results: entitiesToLeads(resultArray(res, 'entities'), category).slice(0, limit),
      };
    }
    return fixtureGet('recommend', { signal, category, limit, query });
  },
};
