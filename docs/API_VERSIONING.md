# API versions and old app versions

Owner 2026-10-14 (architecture audit, step 7).

1. The API lives under `/api/v1`. **A breaking change never ships inside
   v1**: removing or renaming a field, changing a type, tightening a
   validation, removing an endpoint. It goes into `/api/v2` and v1 keeps
   working while old app versions exist.
2. CI enforces it: `api-ci.yml` compares `packages/api-contract/openapi.json`
   with the base branch (oasdiff). A known and reviewed exception is listed
   in `packages/api-contract/oasdiff-err-ignore.txt` with the reason.
3. Adding is always fine: new optional fields, new endpoints, new enum
   values the app treats as "unknown".
4. Old apps are asked to update, never broken: the `app_update` gate
   (minimum build per platform in the admin) shows the update screen to
   builds below the minimum.
5. Database migrations stay expand/contract (`scripts/check-migrations.mjs`),
   so a rolling deploy and a rollback always meet a schema both releases read.
