-- Owner 2026-10-05: the document templates library (admin → Content →
-- Document templates, app → "Templates") behind the `document_templates`
-- flag (on). Additive.
CREATE TYPE document_template_audience AS ENUM ('everyone', 'lawyers');

CREATE TABLE IF NOT EXISTS document_templates (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    file_id UUID NOT NULL,
    file_name STRING NOT NULL,
    title STRING NOT NULL,
    description STRING NOT NULL DEFAULT '',
    practice_area_id UUID,
    state CHAR(2),
    language STRING NOT NULL DEFAULT 'en',
    audience document_template_audience NOT NULL DEFAULT 'everyone',
    is_published BOOL NOT NULL DEFAULT false,
    download_count INT4 NOT NULL DEFAULT 0,
    created_by UUID,
    created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ(6) NOT NULL,
    deleted_at TIMESTAMPTZ(6),
    CONSTRAINT document_templates_pkey PRIMARY KEY (id ASC)
);
CREATE UNIQUE INDEX IF NOT EXISTS document_templates_file_id_key ON document_templates(file_id);
CREATE INDEX IF NOT EXISTS document_templates_is_published_deleted_at_created_at_idx ON document_templates(is_published, deleted_at, created_at);
CREATE INDEX IF NOT EXISTS document_templates_practice_area_id_idx ON document_templates(practice_area_id);
ALTER TABLE document_templates ADD CONSTRAINT document_templates_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE document_templates ADD CONSTRAINT document_templates_practice_area_id_fkey FOREIGN KEY (practice_area_id) REFERENCES practice_areas(id) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO feature_flags (key, enabled, rollout_percent, description, updated_at)
VALUES ('document_templates', true, 100, 'Document templates library (Content → Document templates; app → Templates)', now())
ON CONFLICT (key) DO NOTHING;
