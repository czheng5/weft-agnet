import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { LocalDocsProvider } from '../src/core/kb.ts';

test('local docs search returns citations and respects roots', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-kb-'));
  const docs = join(dir, 'docs');
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(docs, 'note.md'), '# Weft memory\nThe PRD defines MemoryHub and KnowledgeBaseProvider.', 'utf8');
  const kb = new LocalDocsProvider([docs]);
  try {
    const hits = await kb.search({ text: 'MemoryHub', scope: { tenantId: 't1' } });
    assert.equal(hits.length, 1);
    assert.match(hits[0].citation, /note\.md/);
    assert.match(hits[0].snippet, /MemoryHub/);
    const doc = await kb.get(hits[0].docId, { tenantId: 't1' });
    assert.match(doc?.content ?? '', /KnowledgeBaseProvider/);
    const outside = await kb.get(join(dir, 'outside.md'), { tenantId: 't1' });
    assert.equal(outside, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
