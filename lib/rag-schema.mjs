export function ensureRagSchema(db) {
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS material_chunks USING fts5(owner UNINDEXED,lesson UNINDEXED,version UNINDEXED,source_id UNINDEXED,chunk_id UNINDEXED,text, tokenize='unicode61 remove_diacritics 0');
    CREATE TABLE IF NOT EXISTS ai_cache (owner TEXT NOT NULL,cache_key TEXT NOT NULL,result TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(owner,cache_key));
    CREATE TABLE IF NOT EXISTS ai_usage (id TEXT PRIMARY KEY,owner TEXT NOT NULL,operation TEXT NOT NULL,model TEXT NOT NULL,created INTEGER NOT NULL,input_tokens INTEGER,output_tokens INTEGER,status TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS ai_usage_owner_created ON ai_usage(owner,created);
  `);
}
export function chunkPages(pages, size = 2400, overlap = 240) {
  const result = [];
  for (const page of pages) {
    for (let start = 0; start < page.text.length; start += size - overlap) {
      result.push({
        sourceId: page.id,
        chunkId: `${page.id}:${start}`,
        text: page.text.slice(start, start + size),
      });
      if (start + size >= page.text.length) break;
    }
  }
  return result;
}
export function searchTerms(query) {
  return [
    ...new Set(
      (query.normalize("NFKC").match(/[\p{L}\p{N}]{2,}/gu) || []).slice(0, 24),
    ),
  ]
    .map((word) => `"${word}"*`)
    .join(" OR ");
}
export function boundedChunks(chunks, budget = 16000) {
  const result = [];
  let remaining = Math.max(0, Math.min(24000, budget));
  for (const chunk of chunks) {
    if (remaining < 80) break;
    const text = chunk.text.slice(0, remaining);
    result.push({ ...chunk, text });
    remaining -= text.length;
  }
  return result;
}
