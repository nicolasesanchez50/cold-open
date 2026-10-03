// Cold-Open agent pipeline: brand name -> ranked partnership leads + pitches.
//
// Steps:
//   1. resolve  — find_tags to disambiguate the subject entity (type matters:
//                 "Jazz" the music vs "Jazz" the basketball team).
//   2. scan     — recommend/rank across the three lead buckets.
//   3. rank     — score, filter competitors, cap per bucket.
//   4. pitch    — one evidence-cited paragraph per lead + caveat block.
//
// Every Qloo call goes through src/qloo/client.mjs, so the whole pipeline runs
// keyless in fixture mode.

import { qloo } from '../qloo/client.mjs';
import { toLead, rankLeads, BUCKETS } from '../rank/leads.mjs';
import { pitchFor, caveatBlock } from '../pitch/pitch.mjs';

// Map lead buckets to the Qloo categories we query for each.
const BUCKET_QUERIES = {
  brand_collab: ['brands'],
  artist_influencer: ['music', 'podcasts'],
  event_venue: ['dining', 'travel'],
};

export async function resolveSubject(name) {
  const res = await qloo.findTags(name, 5);
  const tags = res.tags ?? res.results ?? res ?? [];
  if (!Array.isArray(tags) || tags.length === 0) {
    throw new Error(`no Qloo tag resolved for "${name}"`);
  }
  // Take the top tag; the runner records alternatives for the audit trail.
  return { chosen: tags[0], alternatives: tags.slice(1) };
}

export async function scanBucket(subjectTag, bucket) {
  const categories = BUCKET_QUERIES[bucket] ?? [];
  const results = [];
  for (const category of categories) {
    const res = await qloo.recommend({
      signal: subjectTag.id ?? subjectTag.name,
      category,
      limit: 10,
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

export async function run(subjectName, { subjectCategory, perBucket = 10 } = {}) {
  const started = new Date().toISOString();
  const { chosen, alternatives } = await resolveSubject(subjectName);

  const scans = [];
  for (const bucket of BUCKETS) {
    scans.push(await scanBucket(chosen, bucket));
  }
  const leads = rankLeads(scans.flat(), {
    subjectCategory: subjectCategory ?? chosen.category ?? chosen.type,
    perBucket,
  });

  const subject = { name: subjectName, tag: chosen };
  return {
    subject: { name: subjectName, resolved_tag: chosen, alternative_tags: alternatives },
    generated_at: started,
    leads: leads.map((lead) => ({ ...lead, pitch: pitchFor(lead, subject) })),
    caveats: caveatBlock(subject),
  };
}
