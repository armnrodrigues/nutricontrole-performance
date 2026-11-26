CREATE TABLE IF NOT EXISTS docs (
  path TEXT PRIMARY KEY,          -- "days/2026-11-20", "settings/main"...
  col TEXT NOT NULL,              -- "days", "settings"...
  data TEXT,                      -- JSON do documento; NULL quando excluído
  updated INTEGER NOT NULL        -- milissegundos; usado para sincronizar só o que mudou
);
CREATE INDEX IF NOT EXISTS docs_updated ON docs(updated);

-- v58 (26/11/2026) · histórico: a versão anterior de cada registro, antes de ser alterado ou excluído (guardada por 30 dias; ver functions/api/docs.js)
CREATE TABLE IF NOT EXISTS docs_hist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  col TEXT NOT NULL,
  data TEXT NOT NULL,             -- JSON da versão anterior
  updated INTEGER NOT NULL,       -- marca de tempo que essa versão tinha em docs
  saved INTEGER NOT NULL          -- quando foi guardada no histórico (ms)
);
CREATE INDEX IF NOT EXISTS docs_hist_col ON docs_hist(col, saved);
CREATE INDEX IF NOT EXISTS docs_hist_path ON docs_hist(path, saved);
