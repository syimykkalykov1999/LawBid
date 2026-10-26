import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Owner 2026-10-23: the data-saver switch for background media work. While
/// it is on, nothing is fetched or played that the viewer did not open:
/// no video prefetch, no muted previews in the Search grid — posters only.
///
/// The app has no settings screen for it yet (no user-visible text was
/// added); the switch is the hook that screen will set. Default: off.
final dataSaverProvider = NotifierProvider<DataSaver, bool>(DataSaver.new);

class DataSaver extends Notifier<bool> {
  @override
  bool build() => false;

  // ignore: use_setters_to_change_properties
  void set({required bool on}) => state = on;
}
