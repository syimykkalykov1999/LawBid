import 'package:lawbid/features/settings/active_devices/domain/device_session_info.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Domain contract for "Активные устройства" (docs/01 §10.4/§10.5).
/// Failures surface as `ApiException` (core/network) like every other
/// repository in the app.
abstract interface class ActiveDevicesRepository {
  /// One page of sessions. [cursor] is the previous page's
  /// `meta.nextCursor` (docs/01 §7); null for the first page.
  Future<CursorPage<DeviceSessionInfo>> fetchPage({String? cursor});

  /// Ends one session (`DELETE /auth/sessions/:id`).
  Future<void> revoke(String sessionId);

  /// Ends every session of the account (`POST /auth/logout-all`).
  Future<void> logoutAll();
}
