/// LawBid API client (docs/01_FOUNDATION_AUTH.md §6.3): retrofit clients and
/// json_serializable models generated from `packages/api-contract/openapi.json`
/// by `packages/api-contract/generate.sh`. Everything under `src/` is
/// generated — never hand-edit it; change the API and regenerate.
///
/// Every 2xx JSON body is an `*Envelope` (`data` + optional `meta`,
/// docs/01 §7). Construct the clients with the app's own configured [Dio]
/// (base URL ending in `/api/v1`, interceptors for auth/idempotency/retry):
/// `LawbidApi(dio).auth.verifyOtp(body: ...)`.
library;

export 'src/export.dart';
