// The one place that reads not-yet-generated DTO fields dynamically.
// ignore_for_file: avoid_dynamic_calls, avoid_catching_errors

/// Fields the server sends (from the 2026-10-22 API branch) that the
/// generated contract of this build may not declare yet.
enum ContractExtra { advertisingLabel, publicUrl, analyticsConsent }

/// Owner 2026-10-22: reads [field] of a generated `package:lawbid_api` DTO
/// although this build's contract may not have it yet (the API adds it in
/// a parallel branch). Null while the DTO has no such getter; the value once
/// the contract is regenerated, with no change at the caller. Replace a use
/// with the plain getter once the field is in the contract.
T? contractField<T>(Object dto, ContractExtra field) {
  final dynamic d = dto;
  try {
    final Object? v = switch (field) {
      ContractExtra.advertisingLabel => d.advertisingLabel,
      ContractExtra.publicUrl => d.publicUrl,
      ContractExtra.analyticsConsent => d.analyticsConsent,
    };
    return v is T ? v : null;
  } on NoSuchMethodError {
    return null;
  }
}
