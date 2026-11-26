import 'dart:async';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart';
import 'package:lawbid/core/platform/system_data_saver_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/system_data_saver_web.dart'
    as browser;

/// G9 (25.11): the phone's own «use less data» switch, read the way Apple
/// and Android document it, so the app goes light by itself (Instagram and
/// WhatsApp do the same):
/// - iOS: Low Data Mode = `NWPath.isConstrained` (Network framework,
///   WWDC 2019 «Advances in Networking»), `NWPathMonitor` in AppDelegate;
/// - Android: Data Saver = `ConnectivityManager.getRestrictBackgroundStatus()`
///   == `RESTRICT_BACKGROUND_STATUS_ENABLED` on a metered network, changes
///   via `ACTION_RESTRICT_BACKGROUND_CHANGED` (developer.android.com
///   «Optimize network data usage»), `DataSaverChannel.kt`;
/// - web: `navigator.connection.saveData` (Network Information API, the
///   browser's «Lite mode» / `Save-Data`), where the browser has it.
abstract interface class SystemDataSaverSource {
  /// The switch now; false when the platform cannot tell.
  Future<bool> current();

  /// Every change of the switch while the app runs.
  Stream<bool> get changes;
}

/// [SystemDataSaverSource] over the `lawbid/data_saver` channels (phones)
/// or the browser. No handler (tests, desktop) = «off», never an error.
class PlatformDataSaverSource implements SystemDataSaverSource {
  const PlatformDataSaverSource();

  static const _method = MethodChannel('lawbid/data_saver');
  static const _events = EventChannel('lawbid/data_saver/changes');

  @override
  Future<bool> current() async {
    if (kIsWeb) return browser.browserSaveData();
    try {
      return await _method.invokeMethod<bool>('isOn') ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  /// EventChannel reports a missing handler through FlutterError.reportError
  /// when the stream is listened to, not through the stream, so the handler
  /// is probed on the method channel first: no handler = no stream.
  @override
  Stream<bool> get changes async* {
    if (kIsWeb) {
      yield* browser.browserSaveDataChanges();
      return;
    }
    try {
      await _method.invokeMethod<bool>('isOn');
    } on MissingPluginException {
      return;
    } on PlatformException {
      // The handler exists; the change stream below still works.
    }
    yield* _events
        .receiveBroadcastStream()
        .map((e) => e == true)
        .handleError((Object? _) {}, test: _isPluginError);
  }

  static bool _isPluginError(Object? error) =>
      error is PlatformException || error is MissingPluginException;
}
