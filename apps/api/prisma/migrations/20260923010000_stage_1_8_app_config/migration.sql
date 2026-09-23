-- CreateTable
CREATE TABLE "app_config" (
    "key" STRING NOT NULL,
    "value" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_config_pkey" PRIMARY KEY ("key")
);
