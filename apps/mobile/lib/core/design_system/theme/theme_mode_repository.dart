import 'package:flutter/material.dart';

/// Reads/writes the user's theme-mode preference. Deliberately an interface:
/// stage 1.5 ships [LocalThemeModeRepository] only (local persistence). Stage
/// 1.7, once real auth/session exists, is expected to swap the Riverpod
/// override for a composite (local + server-synced) implementation of this
/// SAME interface — no call site outside this file should need to change.
abstract interface class ThemeModeRepository {
  Future<ThemeMode> read();

  Future<void> write(ThemeMode mode);
}
