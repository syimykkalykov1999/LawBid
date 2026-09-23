import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:riverpod_annotation/riverpod_annotation.dart';

import '../../auth/application/auth_providers.dart';
import '../../auth/data/auth_dtos.dart';

part 'active_devices_controller.g.dart';

/// Drives `/profile/settings/devices` (file 01 §10.4's "Активные
/// устройства"). Phase 4 of the auth networking work (docs/CHANGELOG.md),
/// continuing directly after Phase 3 social login (commit 2bbeba5).
///
/// `AsyncNotifier` rather than a plain `FutureProvider` (no existing
/// list-fetch precedent elsewhere in this codebase to follow — see
/// docs/CHANGELOG.md's Phase 4 entry) because the screen also needs
/// mutating actions (revoke one, sign out everywhere) that refetch the
/// list afterward; a bare `FutureProvider` has no notifier to hang those
/// methods on.
///
/// NOTE: this file's `.g.dart` part was NOT generated as part of this
/// change (no `dart` binary available on this bridge, same as every other
/// `@riverpod` class in this codebase) — `dart run build_runner build` is
/// required before this compiles.
@riverpod
class ActiveDevicesController extends _$ActiveDevicesController {
  @override
  Future<List<DeviceSession>> build() {
    return ref.watch(authRepositoryProvider).listSessions();
  }

  /// Revokes one session (`DELETE /auth/sessions/:id`) and refetches the
  /// list. If [sessionId] is the caller's own current session, the caller
  /// must also clear local session state and route to Welcome — this
  /// method only does the network call + list refresh, same separation of
  /// concerns as `RealAuthRepository.deleteAccount` (network call) vs. its
  /// caller (routing).
  Future<void> revoke(String sessionId) async {
    await ref.read(authRepositoryProvider).revokeSession(sessionId);
    ref.invalidateSelf();
    await future;
  }

  /// Retries a failed load (pull-to-refresh / the error state's "Повторить"
  /// button both call this).
  Future<void> refresh() async {
    ref.invalidateSelf();
    await future;
  }
}
