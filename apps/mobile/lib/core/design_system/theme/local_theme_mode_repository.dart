// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/theme_mode_repository.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';

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
