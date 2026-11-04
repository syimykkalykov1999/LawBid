SET LOCAL lock_timeout = '5s';

-- R-401 (owner 2026-11-04): nightly Q&A ranking snapshot — per-attorney
-- scores and per-topic top lists; read paths read it instead of counting.
CREATE TABLE "reco_qa_snapshots" (
    "kind" VARCHAR(32) NOT NULL,
    "key" VARCHAR(80) NOT NULL,
    "payload" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reco_qa_snapshots_pkey" PRIMARY KEY ("kind","key")
);
