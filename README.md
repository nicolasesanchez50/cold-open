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

- `search` — entity resolution / disambiguation (the subject's entity id becomes the Insights signal)
- `find_tags` — tag-space resolution kept as an auditable alternative reading
- `recommend` — cross-category affinity scan per bucket (`/v2/insights`, entity signal)

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). **Live demo:**
<https://nicolasesanchez50.github.io/cold-open/>.

## Setup

Requires Node.js 22+ (the recorded/fixture mode needs nothing else).

```sh
git clone https://github.com/nicolasesanchez50/cold-open
cd cold-open
```

For **live** API calls you need the Qloo event CLI and a key (from the hackathon
API-key form):

```sh
npm install --global @qloo/qloo-harness   # v0.1.26+  (provides `qloo`)
qloo setup --qloo                          # enter your event credential (hidden)
qloo setup --status                        # expect "Qloo data: ready"
```

No npm dependencies — the demo server and pipeline are pure Node stdlib.

## Run

CLI:

```sh
node src/agent/cli.mjs Patagonia
node src/agent/cli.mjs "Red Bull" --json
```

Live CLI (direct REST, same request shapes as the hosted demo):

```sh
export QLOO_API_KEY=<your event key>
export QLOO_BASE_URL=https://hackathon.api.qloo.com
export QLOO_TRUSTED_BASE_URL=https://hackathon.api.qloo.com
COLDOPEN_QLOO_MODE=live node src/agent/cli.mjs Patagonia
```

Web demo:

```sh
node src/web/server.mjs 3737
# open http://localhost:3737
```

## Modes

- **Recorded mode** (default): the pipeline runs against responses recorded in
  `fixtures/` by `scripts/record_fixtures.py` — captured from the live hackathon
  API, field selection only, nothing invented. No credential needed, so the
  hosted page works for any visitor. The page labels this state explicitly.
- **Live mode**: a saved event API key (browser, localStorage) or
  `COLDOPEN_QLOO_MODE=live` (CLI) routes every call to
  `https://hackathon.api.qloo.com`.

The event key is never committed, never embedded in the page, and never written
to a fixture — visitors supply their own for live mode.

```sh
QLOO_API_KEY=<your key> python3 scripts/record_fixtures.py   # re-record fixtures
```

## Tests

```sh
node --test
```

The suite includes an API-contract test that pins every `filter.type` the
project maps to the developer guide's supported list — an earlier revision
shipped `urn:entity:music_artist` and `urn:entity:place:restaurant`, both of
which the API rejects with HTTP 400.

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
- Recorded-mode fixtures are real Qloo responses captured on a fixed date, not
  a live call — the page says so. Re-run `scripts/record_fixtures.py` to
  refresh them; live mode always reflects the current graph.
- Insights is queried with an **entity** signal. A **tag** signal only moves
  the needle for tag/type pairs that are graph-connected; for most pairs the
  API returns the same default list at a constant affinity (0.765), which
  would make every subject look identical. Tag-signalled requests against
  `urn:entity:place` additionally took 32–46 s (and 504s) in measurement.
- `urn:entity:music_artist` and `urn:entity:place:restaurant` are not valid
  `filter.type` values (HTTP 400); the supported list is pinned by a test.

## License

MIT — see [LICENSE](LICENSE).
