/// Minimal dotted-version comparison — the Dart-side mirror of
/// `apps/api/src/common/utils/semver.util.ts` (kept in sync
/// deliberately: same dotted-integer comparison, same `+build`/
/// `-prerelease` suffix stripping, same "can't parse -> not below"
/// behavior). Used only to compare `HeadersInterceptor.appVersion`
/// against the `min_app_version_*`/`soft_update_version_*` strings
/// `/config/bootstrap` returns in `app_config` — see
/// `feature_flags_providers.dart`'s `isAppUpdateRequiredProvider`.
library;

/// `true` only when both versions parse as dotted integers AND [version]
/// is strictly below [minVersion]. Never throws; unparseable input
/// returns `false` ("not below") rather than blocking the app on a
/// config value this client can't make sense of.
bool isVersionBelow(String version, String minVersion) {
  final a = _parse(version);
  final b = _parse(minVersion);
  if (a == null || b == null) return false;

  final length = a.length > b.length ? a.length : b.length;
  for (var i = 0; i < length; i++) {
    final partA = i < a.length ? a[i] : 0;
    final partB = i < b.length ? b[i] : 0;
    if (partA != partB) return partA < partB;
  }
  return false;
}

List<int>? _parse(String raw) {
  final core = raw.split(RegExp(r'[+-]')).first;
  final segments = core.split('.');
  if (segments.isEmpty) return null;
  final parts = <int>[];
  for (final segment in segments) {
    final n = int.tryParse(segment);
    if (n == null) return null;
    parts.add(n);
  }
  return parts;
}
