// Browser Qloo client — same op surface as src/qloo/client.mjs, over fetch.
//
// Two modes, selected by whether an event API key is configured:
//   live     -> GET https://hackathon.api.qloo.com/... with the `X-Api-Key`
//               header. The hackathon endpoint answers with
//               `access-control-allow-origin: *` and `allow-headers: *`
//               (verified by probe), so the browser may call it directly —
//               no backend proxy is needed for the hosted demo.
//   fixture  -> fetches the recorded responses in fixtures/ so the pipeline
//               runs keyless (development and tests before the event
//               credential arrives). The UI must label fixture output as
//               sample data — those numbers are development fixtures, not
//               Qloo results.
//
// Request shapes mirror the event harness (`qloo exec`) exactly:
//   find_tags  -> GET /v2/tags?filter.query=...&feature.semantic_search=true&take=...
//   recommend  -> GET /v2/insights?filter.type=urn:entity:...&signal.interests.tags=...
//                 (GET only; parameters belong in the query string)

const BASE = 'https://hackathon.api.qloo.com';
const FIXTURE_BASE = 'fixtures/';
const KEY_STORAGE = 'coldopen.qloo_api_key';

// Bucket query category -> Insights filter.type (event entity types).
const INSIGHTS_TYPE = {
  brands: 'urn:entity:brand',
  music: 'urn:entity:music_artist',
  podcasts: 'urn:entity:podcast',
  dining: 'urn:entity:place:restaurant',
  travel: 'urn:entity:place',
};

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

function compactTag(t) {
  if (!t || typeof t !== 'object') return undefined;
  return {
    id: t.id ?? t.tag_id,
    name: t.name,
    category: t.category ?? t.type,
    type: t.type ?? t.subtype,
    popularity: t.popularity,
  };
}

// Evidence must come from the API, never be invented: only fields the
// response actually carries are surfaced (see pitchFor, which drops missing
// evidence rather than asserting it).
function evidenceFor(entity) {
  const explain = entity?.query?.explainability ?? entity?.explainability;
  const evidence = {};
  const correlated =
    explain?.correlated_categories ??
    entity?.properties?.correlated_categories ??
    entity?.correlated_categories;
  if (Array.isArray(correlated) && correlated.length) {
    evidence.correlated_categories = correlated;
  }
  const overlap = explain?.audience_overlap ?? entity?.properties?.audience_overlap;
  if (overlap !== undefined && overlap !== null) evidence.audience_overlap = overlap;
  return Object.keys(evidence).length ? evidence : null;
}

export const browserQloo = {
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

  async recommend({ signal, category, limit = 10 }) {
    if (mode() === 'live') {
      const filterType = INSIGHTS_TYPE[category];
      if (!filterType) throw new QlooError('recommend', `unknown category "${category}"`);
      const res = await liveGet('recommend', '/v2/insights', {
        'filter.type': filterType,
        'signal.interests.tags': signal,
        take: limit,
        'feature.explainability': 'true',
      });
      return {
        results: resultArray(res, 'entities')
          .map((entity) => ({
            name: entity?.name,
            affinity: entity?.affinity ?? entity?.query?.affinity ?? 0,
            category,
            evidence: evidenceFor(entity),
          }))
          .filter((e) => e.name)
          .slice(0, limit),
      };
    }
    return fixtureGet('recommend', { signal, category, limit });
  },
};
