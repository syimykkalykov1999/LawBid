import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/config/client_tuning.dart';
import 'package:lawbid/core/transfers/adaptive_limiter.dart';

/// The app's one pair of limits: however many files are moving, no more
/// pieces than these travel at once, so three queued videos do not become
/// twelve connections on a weak phone.
abstract final class TransferLimits {
  /// Owner 2026-11-09: parts start at `client.uploads_at_once`, climb up to
  /// `client.upload_parts_max` while the speed grows (ThroughputClimb) and
  /// fall to `client.upload_parts_min` after a failure.
  static final uploads = newUploadLimiter();

  /// A limiter with the upload rules (one for the app; tests make their own).
  static AdaptiveLimiter newUploadLimiter() => AdaptiveLimiter(
        () => ClientTuning.uploadPartsCeiling,
        start: () => ClientTuning.uploadPartsStart,
        floor: () => ClientTuning.uploadPartsFloor,
      );
  static final downloads = AdaptiveLimiter(() => ClientTuning.downloadsAtOnce);

  static Future<void>? _checked;

  /// Called when a file big enough for pieces starts (not at app start, so
  /// nobody pays for it who never sends one). Never throws.
  static Future<void> checkDevice() => _checked ??= _check();

  static Future<void> _check() async {
    try {
      final info = DeviceInfoPlugin();
      if (kIsWeb) {
        final memory = (await info.webBrowserInfo).deviceMemory;
        ClientTuning.weakDevice = memory != null && memory < _weakRamGb;
      } else if (defaultTargetPlatform == TargetPlatform.android) {
        final a = await info.androidInfo;
        ClientTuning.weakDevice =
            a.isLowRamDevice || a.physicalRamSize < _weakRamGb * 1024;
      } else if (defaultTargetPlatform == TargetPlatform.iOS) {
        final i = await info.iosInfo;
        ClientTuning.weakDevice = i.physicalRamSize < _weakRamGb * 1024;
      }
    } on Object catch (e) {
      debugPrint('device class: $e');
    }
  }

  /// Under this much memory a phone keeps to two pieces at once.
  static const _weakRamGb = 3;

  /// Tests: forget the device check.
  @visibleForTesting
  static void debugReset() => _checked = null;
}
