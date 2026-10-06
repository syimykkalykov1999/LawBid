-- Owner 2026-10-05 (legal documents): every legal text is edited in the
-- admin (Система → Юридические документы). New document types and the
-- consents given to the role agreements. Enum values are added on their
-- own (CockroachDB cannot use a new value in the transaction that adds it).
ALTER TYPE legal_doc_type ADD VALUE IF NOT EXISTS 'attorney_agreement';
ALTER TYPE legal_doc_type ADD VALUE IF NOT EXISTS 'client_agreement';
ALTER TYPE legal_doc_type ADD VALUE IF NOT EXISTS 'eula';
ALTER TYPE legal_doc_type ADD VALUE IF NOT EXISTS 'refund';
ALTER TYPE legal_doc_type ADD VALUE IF NOT EXISTS 'cookies';
ALTER TYPE legal_doc_type ADD VALUE IF NOT EXISTS 'third_party_services';
ALTER TYPE legal_doc_type ADD VALUE IF NOT EXISTS 'partner_terms';
ALTER TYPE legal_doc_type ADD VALUE IF NOT EXISTS 'dmca_policy';

ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'attorney_agreement';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'client_agreement';
ALTER TYPE consent_type ADD VALUE IF NOT EXISTS 'eula';
