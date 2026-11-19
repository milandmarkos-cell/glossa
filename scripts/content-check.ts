/**
 * Content checker: `npm run content:check [language]`
 * Lists word forms in the bundled stories that have no dictionary entry (ready to paste into
 * content/<lang>/dictionary.txt and fill in), lemmas without their own entry, and story stats.
 * Exits 1 when anything is missing, so it can gate CI.
 */
import { coverage, loadContent } from '../src/server/content.ts';
import { CEFR_LEVELS } from '../src/shared/languages.ts';

const only = process.argv[2];
let content;
try {
  content = loadContent('content');
} catch (e) {
  console.error((e as Error).message);
  process.exit(1);
}
let bad = false;
for (const r of coverage(content)) {
  if (only && r.language !== only) continue;
  const byLevel = Object.fromEntries(CEFR_LEVELS.map((l) => [l, r.stories.filter((s) => s.level === l)]));
  console.log(`\n== ${r.language}: ${r.stories.length} stories ==`);
  for (const l of CEFR_LEVELS) console.log(`  ${l}: ${byLevel[l].length} stories, words ${byLevel[l].map((s) => s.words).join(', ')}`);
  if (r.missing.length) {
    bad = true;
    console.log(`  ${r.missing.length} word forms missing from content/${r.language}/dictionary.txt:`);
    for (const m of r.missing.sort((a, b) => b.count - a.count)) console.log(`${m.surface} |  |  |   # ${m.count}× ${m.stories[0]}`);
  }
  if (r.missingLemmas.length) {
    bad = true;
    console.log(`  ${r.missingLemmas.length} lemmas without their own entry:`);
    for (const m of r.missingLemmas) console.log(`${m.lemma} |  |  |   # lemma of ${m.from}`);
  }
  if (!r.missing.length && !r.missingLemmas.length) console.log('  dictionary covers every word ✓');
}
process.exit(bad ? 1 : 0);
