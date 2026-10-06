// Static demo entry point: runs the shared pipeline in the browser and
// renders the result. Imported by index.html (hosted demo) as
// `<script type="module">`.
//
// Transport selection lives in ./qloo-browser.mjs: live Qloo REST calls when
// an event API key is configured, recorded fixtures otherwise — and the page
// must say which one it is showing.

import { runWith } from '../core/pipeline.mjs';
import { browserQloo, mode, apiKey, setApiKey } from './qloo-browser.mjs';

export async function demoRun(brand, category) {
  return runWith(browserQloo, brand, {
    subjectCategory: category || undefined,
  });
}

function el(id) {
  return document.getElementById(id);
}

export function mount() {
  const form = el('f');
  const out = el('out');
  const status = el('status');
  const banner = el('mode-banner');
  const keyForm = el('key-form');
  const hint = el('recorded-hint');
  if (!form || !out || !status) return;

  function renderMode() {
    if (banner) {
      if (mode() === 'live') {
        banner.textContent = 'Mode: LIVE Qloo API — every result below is a fresh call.';
        banner.dataset.mode = 'live';
      } else {
        banner.textContent =
          'Mode: RECORDED QLOO RESPONSES — captured from the live hackathon API by ' +
          'scripts/record_fixtures.py (field selection only, nothing invented), shown ' +
          'keyless. Save an event API key below to run live queries on any subject.';
        banner.dataset.mode = 'fixture';
      }
    }
    if (hint) {
      if (mode() === 'live') {
        hint.textContent = '';
      } else {
        fetch('fixtures/index.json', { cache: 'no-store' })
          .then((r) => (r.ok ? r.json() : null))
          .then((idx) => {
            if (idx?.subjects?.length) {
              hint.textContent = `Recorded subjects: ${idx.subjects.join(', ')}. ` +
                'Any other subject needs an event API key (live mode).';
            }
          })
          .catch(() => {
            /* no manifest — the hint simply stays empty */
          });
      }
    }
  }
  renderMode();

  if (keyForm) {
    const input = keyForm.querySelector('input[name=key]');
    if (input) input.value = apiKey() ? '••••••••' : '';
    keyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = (input?.value || '').trim();
      // Ignore the masked placeholder unless it was replaced.
      if (value && !/^•+$/.test(value)) setApiKey(value);
      else if (value === '') setApiKey('');
      if (input) input.value = apiKey() ? '••••••••' : '';
      renderMode();
      status.textContent = mode() === 'live'
        ? 'API key saved — live Qloo calls enabled.'
        : 'Key cleared — running on sample fixtures.';
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const brand = form.brand.value.trim();
    const category = form.category.value.trim();
    out.innerHTML = '';
    if (!brand) return;
    status.textContent = 'Querying Qloo…';
    try {
      const data = await demoRun(brand, category);
      const subject = data.subject;
      const entity = subject.resolved_entity;
      const tag = subject.resolved_tag;
      const alternatives = subject.alternative_entities ?? [];
      status.textContent =
        `Resolved "${subject.name}" → ${entity.name} (${entity.entity_id}) ` +
        `[${(entity.types || []).join(', ')}]` +
        (tag ? ` · tag ${tag.name}` : '') +
        (alternatives.length ? ` · ${alternatives.length} alternative(s) considered` : '') +
        ` · ${mode() === 'live' ? 'live Qloo data' : 'recorded Qloo responses'}` +
        ` · ${data.leads.length} leads`;
      out.innerHTML =
        data.leads
          .map(
            (l) => `
      <div class="lead">
        <h3>#${l.rank} ${escapeHtml(l.name)}</h3>
        <div class="meta">${escapeHtml(l.bucket.replace('_', ' '))} · affinity ${l.affinity.toFixed(2)} · ${escapeHtml(String(l.category))}</div>
        <p>${escapeHtml(l.pitch)}</p>
      </div>`,
          )
          .join('') + `<div class="caveats">${escapeHtml(data.caveats)}</div>`;
    } catch (err) {
      status.textContent = 'Error: ' + (err?.message || err);
    }
  });
}

// Minimal escaping: pitches and caveat text are generated locally, but lead
// names come from an external API response.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
}
