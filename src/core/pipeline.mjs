// Cold-Open agent pipeline, decoupled from any specific Qloo transport.
//
// Steps:
//   1. resolve  — find_tags to disambiguate the subject entity (type matters:
//                 "Jazz" the music vs "Jazz" the basketball team).
//   2. scan     — recommend/rank across the three lead buckets.
//   3. rank     — score, filter competitors, cap per bucket.
//   4. pitch    — one evidence-cited paragraph per lead + caveat block.
//
// The `client` parameter is the transport: src/qloo/client.mjs in Node
// (harness CLI or recorded fixtures), src/web/qloo-browser.mjs in the browser
// (live REST API or fetched fixtures). Everything else is shared, so the CLI,
// the demo server and the static demo all run the same pipeline.

import { toLead, rankLeads, BUCKETS } from '../rank/leads.mjs';
import { pitchFor, caveatBlock } from '../pitch/pitch.mjs';

// Map lead buckets to the Qloo categories we query for each.
//
// `dining` resolves to urn:entity:place, which is only usable with an
// entity signal (tag signals there take 32-46s / 504 — measured 2026-10-06).
export const BUCKET_QUERIES = {
  brand_collab: ['brands'],
  artist_influencer: ['music', 'podcasts'],
  event_venue: ['dining', 'travel'],
};

// Prefer the brand reading of an ambiguous name (the tool is brand-centric);
// otherwise take the search ranking's top hit. Alternatives are surfaced so
// the resolution stays auditable — a wrong pick is visible, not hidden.
const BRAND_TYPE = 'urn:entity:brand';

export async function resolveSubject(client, name) {
  const found = await client.search(name, 5);
  const candidates = found?.results ?? found ?? [];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error(`no Qloo entity resolved for "${name}"`);
  }
  const chosen =
    candidates.find((c) => Array.isArray(c.types) && c.types.includes(BRAND_TYPE)) ??
    candidates[0];
  const alternatives = candidates.filter((c) => c.entity_id !== chosen.entity_id);

  // The tag resolution is supplementary: it records how the name disambiguates
  // in Qloo's tag space ("Jazz" the music vs "Jazz" the basketball team) and
  // is shown alongside the entity pick. Failure here does not fail the run.
  let tag = null;
  try {
    const res = await client.findTags(name, 5);
    const tags = res?.tags ?? res?.results ?? res ?? [];
    if (Array.isArray(tags) && tags.length) tag = tags[0];
  } catch {
    tag = null;
  }
  return { chosen, alternatives, tag };
}

export async function scanBucket(client, subject, subjectName, bucket) {
  const categories = BUCKET_QUERIES[bucket] ?? [];
  const results = [];
  for (const category of categories) {
    const res = await client.recommend({
      signal: subject.entity_id,
      category,
      limit: 10,
      // Carried for deterministic fixture naming only; never sent to the API.
      query: subjectName,
    });
    const entries = res.recommendations ?? res.results ?? res ?? [];
    for (const e of entries) {
      // Preserve the entry's own category (used for competitor filtering);
      // the query category is only a fallback.
      results.push(toLead({ category, ...e }, bucket));
    }
  }
  return results;
}

export async function runWith(client, subjectName, { subjectCategory, perBucket = 10 } = {}) {
  const started = new Date().toISOString();
  const { chosen, alternatives, tag } = await resolveSubject(client, subjectName);

  const scans = [];
  for (const bucket of BUCKETS) {
    scans.push(await scanBucket(client, chosen, subjectName, bucket));
  }
  const leads = rankLeads(scans.flat(), {
    subjectCategory: subjectCategory ?? chosen.category ?? chosen.type ?? tag?.type,
    perBucket,
  });

  return {
    subject: {
      name: subjectName,
      resolved_entity: chosen,
      alternative_entities: alternatives,
      resolved_tag: tag,
    },
    generated_at: started,
    leads: leads.map((lead) => ({ ...lead, pitch: pitchFor(lead, { name: subjectName }) })),
    caveats: caveatBlock({ name: subjectName }),
  };
}
