// Score inspection reports against the field-test ground truth.
// 1. Re-inspect the test scaffolds (tag IDs B 50, SC 02, SC 03, SC 04) with the tool.
// 2. Settings → Data on this device → Export all (JSON).
// 3. node scripts/score-field-test.mjs inspections-YYYY-MM-DD.json [tests/field-test-2026-11/ground_truth.json]
import fs from 'node:fs';
const [exportFile, truthFile = new URL('../tests/field-test-2026-11/ground_truth.json', import.meta.url)] = process.argv.slice(2);
if (!exportFile) { console.log('Usage: node scripts/score-field-test.mjs <exported.json> [ground_truth.json]'); process.exit(1); }
const truth = JSON.parse(fs.readFileSync(truthFile, 'utf8'));
const data = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
const reports = (data.reports || data).filter((r) => r?.result?.checklist);
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const NAME = { present: 'OK', missing: 'Not OK', absent: 'Not provided', unclear: 'Not visible', na: 'Not applicable' };
const checkName = (part) => String(part).replace(/^[!?\s]+/, '').split('::')[0].trim();
let all = 0, good = 0;
for (const [id, t] of Object.entries(truth.scaffolds)) {
  // latest report for this tag
  const rep = reports.filter((r) => norm(r.asset?.id) === norm(id)).sort((a, b) => new Date(b.result.evaluatedAt) - new Date(a.result.evaluatedAt))[0];
  if (!rep) { console.log(`\n${t.label} (${id}): no report found in the export`); continue; }
  let ok = 0, n = 0; const wrong = [];
  for (const [name, exp] of Object.entries(t.expected)) {
    const row = rep.result.checklist.find((c) => checkName(c.part).toLowerCase() === name.toLowerCase());
    if (!row) continue;
    const allowed = Array.isArray(exp) ? exp : [exp];
    n++;
    if (allowed.includes(row.status)) ok++; else wrong.push(`${name}: AI ${NAME[row.status] || row.status}, inspector ${allowed.map((x) => NAME[x]).join(' / ')}`);
  }
  all += n; good += ok;
  const typeOk = rep.scaffoldType === t.type ? 'correct' : `AI/selected: ${rep.scaffoldType || '–'}, expected ${t.type}`;
  console.log(`\n${t.label} (${id}) – ${ok}/${n} correct (${n ? Math.round((ok / n) * 100) : 0}%) · scaffold type ${typeOk}`);
  wrong.forEach((w) => console.log('   ✗ ' + w));
}
console.log(`\nOVERALL: ${good}/${all} correct = ${all ? Math.round((good / all) * 100) : 0}%   (baseline before v7: ${truth.baseline.accuracy})`);
