-- M6/v2.4 thread project-management metadata
ALTER TABLE runtime_threads ADD COLUMN IF NOT EXISTS priority TEXT;
ALTER TABLE runtime_threads ADD COLUMN IF NOT EXISTS owner TEXT;
ALTER TABLE runtime_threads ADD COLUMN IF NOT EXISTS due_at BIGINT;
ALTER TABLE runtime_threads ADD COLUMN IF NOT EXISTS labels_json TEXT;
