CREATE TABLE IF NOT EXISTS docs (
  path TEXT PRIMARY KEY,          -- "days/2026-11-20", "settings/main"...
  col TEXT NOT NULL,              -- "days", "settings"...
  data TEXT,                      -- JSON do documento; NULL quando excluído
  updated INTEGER NOT NULL        -- milissegundos; usado para sincronizar só o que mudou
);
CREATE INDEX IF NOT EXISTS docs_updated ON docs(updated);
