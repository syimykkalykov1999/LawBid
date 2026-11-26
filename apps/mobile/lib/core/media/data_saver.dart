import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/platform/system_data_saver.dart';

/// Owner 2026-10-23: the data-saver switch for background media work. While
/// it is on, nothing is fetched or played that the viewer did not open:
/// no video prefetch, no muted previews in the Search grid — posters only.
///
/// G9 (25.11): it follows the phone's own switch — iOS Low Data Mode,
/// Android Data Saver, the browser's `saveData` (system_data_saver.dart) —
/// so the app is light whenever the person asked the phone for that. The
/// app has no settings screen for it (no user-visible text was added);
/// [DataSaver.set] stays the hook such a screen would use, and its choice
/// wins over the system signal.
final dataSaverProvider = NotifierProvider<DataSaver, bool>(DataSaver.new);

/// Where the system signal comes from (tests swap in a fake).
final systemDataSaverSourceProvider = Provider<SystemDataSaverSource>(
  (ref) => const PlatformDataSaverSource(),
);

class DataSaver extends Notifier<bool> {
  bool? _manual;

  @override
  bool build() {
    final source = ref.watch(systemDataSaverSourceProvider);
    final sub = source.changes.listen(_onSystem);
    ref.onDispose(sub.cancel);
    unawaited(source.current().then(_onSystem, onError: (Object _) {}));
    return _manual ?? false;
  }

  void _onSystem(bool on) {
    if (!ref.mounted) return;
    state = _manual ?? on;
  }

  /// An explicit choice (a future settings screen); wins over the system.
  // ignore: use_setters_to_change_properties
  void set({required bool on}) {
    _manual = on;
    state = on;
  }
}
