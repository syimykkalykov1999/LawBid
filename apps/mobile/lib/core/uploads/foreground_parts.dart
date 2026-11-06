import 'dart:async';

import 'package:flutter/widgets.dart';
import 'package:lawbid/core/uploads/storage_uploader.dart';

/// R-251 (owner 05.11): a queued chat file may go in parallel parts only
/// while the app is on screen. The OS background transfer takes one whole
/// file; it is what keeps an upload going in a closed app, so it stays the
/// way out: the moment the app leaves the screen the parts stop and the file
/// is handed to the OS ([StorageUploader.upload]).
///
/// [handsOff] is false where nothing is suspended and no OS service exists
/// (the browser, desktop): there the parts simply carry on.
class ForegroundParts with WidgetsBindingObserver implements PartsGate {
  ForegroundParts({
    required bool Function() enabled,
    required Future<bool> Function(String taskId) osTransferKnown,
    required this.handsOff,
    bool observeLifecycle = true,
    AppLifecycleState? initial,
  })  : _enabled = enabled,
        _osTransferKnown = osTransferKnown,
        _state = initial ?? WidgetsBinding.instance.lifecycleState {
    if (observeLifecycle) WidgetsBinding.instance.addObserver(this);
    _observing = observeLifecycle;
  }

  final bool Function() _enabled;
  final Future<bool> Function(String taskId) _osTransferKnown;
  final bool handsOff;
  late final bool _observing;

  AppLifecycleState? _state;
  Completer<void> _left = Completer<void>();

  static bool _away(AppLifecycleState? s) =>
      s == AppLifecycleState.hidden ||
      s == AppLifecycleState.paused ||
      s == AppLifecycleState.detached;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    _state = state;
    if (_away(state)) {
      if (handsOff && !_left.isCompleted) _left.complete();
    } else if (state == AppLifecycleState.resumed && _left.isCompleted) {
      _left = Completer<void>();
    }
  }

  @override
  Future<bool> allows(String taskId) async {
    if (!_enabled()) return false;
    if (handsOff && _away(_state)) return false;
    // A transfer the OS already holds (the app was reopened) is left to it:
    // the same file must not go twice.
    return !(handsOff && await _osTransferKnown(taskId));
  }

  @override
  Future<void> get whenLeft => _left.future;

  void dispose() {
    if (_observing) WidgetsBinding.instance.removeObserver(this);
  }
}
