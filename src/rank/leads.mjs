// Lead ranking: turn Qloo affinity results into scored partnership candidates.
//
// A candidate's score is its affinity strength (from Qloo rank/recommend
// results) weighted by bucket priors and penalized when the candidate looks
// like a direct competitor of the subject brand (same category).
//
// Everything here is pure functions over the normalized Qloo result shape;
// no I/O, so the ranker is trivially testable against fixtures.

const BUCKETS = ['brand_collab', 'artist_influencer', 'event_venue'];

// Category hints that mark a candidate as a probable competitor when it
// shares the subject's own category. Compared case-insensitively against the
// candidate's category/type fields.
export function isCompetitor(candidate, subjectCategory) {
  if (!subjectCategory) return false;
  const candCat = String(candidate.category || candidate.type || '').toLowerCase();
  const subj = String(subjectCategory).toLowerCase();
  return candCat.length > 0 && candCat === subj;
}

// Normalize one Qloo affinity entry into a lead record.
// Expected fields (tolerant): name/entity, affinity/score/strength, category/type.
export function toLead(entry, bucket) {
  const affinity =
    Number(entry.affinity ?? entry.score ?? entry.strength ?? 0) || 0;
  return {
    name: entry.name ?? entry.entity ?? String(entry),
    category: entry.category ?? entry.type ?? 'unknown',
    bucket,
    affinity,
    evidence: entry.evidence ?? null,
  };
}

// Rank leads: affinity desc, competitors filtered out, per-bucket cap applied.
export function rankLeads(leads, { subjectCategory, perBucket = 10, minAffinity = 0 } = {}) {
  const filtered = leads.filter(
    (l) => l.affinity >= minAffinity && !isCompetitor(l, subjectCategory),
  );
  filtered.sort((a, b) => b.affinity - a.affinity || a.name.localeCompare(b.name));
  const counts = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  const out = [];
  for (const lead of filtered) {
    if (counts[lead.bucket] === undefined) counts[lead.bucket] = 0;
    if (counts[lead.bucket] >= perBucket) continue;
    counts[lead.bucket] += 1;
    out.push({ ...lead, rank: out.length + 1 });
  }
  return out;
}

export { BUCKETS };
