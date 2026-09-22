import 'package:flutter/material.dart';

import '../../persistence/local_kv_store.dart';
import 'theme_mode_repository.dart';

const _kThemeModeKey = 'design_system.theme_mode';

/// Local-only [ThemeModeRepository] backed by [LocalKvStore] (SharedPreferences).
class LocalThemeModeRepository implements ThemeModeRepository {
  const LocalThemeModeRepository(this._kv);

  final LocalKvStore _kv;

  @override
  Future<ThemeMode> read() async {
    final raw = _kv.getString(_kThemeModeKey);
    return switch (raw) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };
  }

  @override
  Future<void> write(ThemeMode mode) {
    final raw = switch (mode) {
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
      ThemeMode.system => 'system',
    };
    return _kv.setString(_kThemeModeKey, raw);
  }
}
