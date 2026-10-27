import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

/// S16-12: tells Android `reportFullyDrawn()` when the first feed content
/// is on the glass, so Play vitals show the real time to fully drawn (TTFD)
/// instead of only the first frame. One tiny platform call, once per
/// process; iOS, web and tests (no handler) ignore it.
abstract final class StartupSignals {
  static const _channel = MethodChannel('lawbid/startup');
  static bool _sent = false;

  static void feedPainted() {
    if (_sent || kIsWeb) return;
    _sent = true;
    SchedulerBinding.instance.addPostFrameCallback((_) async {
      try {
        await _channel.invokeMethod<void>('fullyDrawn');
      } on PlatformException {
        // Nothing to do.
      } on MissingPluginException {
        // iOS / tests.
      }
    });
  }
}
