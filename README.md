# Cold-Open

**Taste-matched partnership lead generation, powered by Qloo.**

Cold-Open is an agentic tool for B2B partnership discovery. Give it a brand or
product and it surfaces non-obvious collaboration, artist/influencer, and
event/venue partners — ranked by the strength of their aggregate taste
affinity with your brand, each with the evidence cited.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

## The problem

Brand partnership and sponsorship teams pick counterparties from gut feel,
existing networks, or generic market research. The non-obvious fits — the
artist whose audience quietly over-indexes on your category, the event format
your buyers already love — are exactly the ones nobody pitches, because
nobody has the cross-category data to see them.

## What it does

1. **Resolves** your brand to a Qloo entity/tag (disambiguating e.g. "Jazz"
   the music from "Jazz" the basketball team).
2. **Scans** Qloo's cross-category affinity graph across three lead buckets:
   brand collaborations, artist/influencer partnerships, and event/venue
   activations.
3. **Ranks** candidates by affinity strength and filters out direct
   competitors (same category as your brand).
4. **Pitches**: generates one short paragraph per lead citing the specific
   Qloo evidence (correlated categories, audience overlap index), plus an
   explicit "what this does not establish" block.

## Qloo workflows used

- `find_tags` — entity resolution / disambiguation
- `recommend` — cross-category affinity scan per bucket

(via the hackathon harness `qloo exec`, the supported event surface)

## Setup

Requires Node.js 22.19+.

```sh
npm install --global @qloo/qloo-harness   # v0.1.26+
qloo setup --qloo                          # enter your event credential (hidden)
qloo setup --status                        # expect "Qloo data: ready"

git clone <this-repo>
cd cold-open
```

No npm dependencies — the demo server and pipeline are pure Node stdlib.

## Run

CLI:

```sh
node src/agent/cli.mjs Mezcal --category alcoholic_drinks
node src/agent/cli.mjs "My Brand" --json
```

Web demo:

```sh
node src/web/server.mjs 3737
# open http://localhost:3737
```

## Modes

- **Fixture mode** (default): the pipeline runs against recorded responses in
  `fixtures/` — no credential needed, deterministic, used by tests.
- **Live mode**: `COLDOPEN_QLOO_MODE=live` routes calls through `qloo exec`
  against the hackathon API (`https://hackathon.api.qloo.com`).

```sh
export QLOO_BASE_URL=https://hackathon.api.qloo.com
export QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com
COLDOPEN_QLOO_MODE=live node src/agent/cli.mjs Mezcal
```

## Tests

```sh
node --test test/
```

## Responsible data handling

- No personal data is sent to Qloo. Inputs are brand/product names only —
  aggregate cultural signals, per the hackathon's safe-use rules.
- All results are labeled as aggregate group-level affinities, never as
  claims about individuals, and never as causal or predictive claims.
- The API credential is entered via `qloo setup` and never appears in source,
  fixtures, logs, or the demo.

## Known limitations

- Affinity scores are group-level correlations from Qloo. They do not
  establish that any partnership will perform, and they are not evidence
  about any individual.
- Results depend on the entity/tag resolution chosen for the subject; a
  brand with an ambiguous name may resolve to the wrong tag. The CLI output
  lists alternative tags considered so this is auditable.
- Scores describe taste affinity only — not budget fit, counterparty
  availability, exclusivity conflicts, or brand-safety concerns. A human
  partnership lead still qualifies the shortlist.
- Fixture-mode fixtures are illustrative recordings, not live Qloo output;
  they exist so the pipeline and tests run without a credential.

## License

MIT — see [LICENSE](LICENSE).
