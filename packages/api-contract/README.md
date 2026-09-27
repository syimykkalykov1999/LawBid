# api-contract

Shared OpenAPI-generated Dart client + shared TypeScript types between
apps/api and apps/mobile. Generated from the NestJS Swagger spec; never
hand-edited. Regenerate after any endpoint change (see .cursorrules).

- `openapi.json` — exported by `npm run openapi:export --workspace apps/api`
  (builds the API, boots it against the dev DB/Redis, writes this file).
  DTO schemas come from the `@nestjs/swagger` CLI plugin (nest-cli.json).
- Not yet: response schemas (controllers return plain objects, so
  responses are untyped in the document) and the generated Dart client.
