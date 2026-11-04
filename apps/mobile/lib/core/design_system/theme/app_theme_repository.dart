import 'dart:async';

import 'package:flutter/painting.dart';
import 'package:lawbid/core/design_system/theme/app_theme_id.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';

const _kThemeKey = 'design_system.theme_mode';

/// R-112 (owner 28.10): the chosen theme's background as `#AARRGGBB`, read by
/// the NATIVE side before Flutter draws (Android `MainActivity.onCreate` via
/// `FlutterSharedPreferences`, iOS `AppDelegate` via `UserDefaults`, both with
/// the `flutter.` prefix) and set as the window background. Without it the
/// window behind Flutter is the system's white and shows through on any frame
/// Flutter does not cover. Absent = no theme chosen (the native default, which
/// follows the phone's day / night, is right).
const kWindowBgKey = 'design_system.window_bg';

/// `#AARRGGBB` of [color] (what Android's `Color.parseColor` reads).
String windowBgWire(Color color) {
  String two(double channel) =>
      (channel * 255).round().clamp(0, 255).toRadixString(16).padLeft(2, '0');
  return '#${two(color.a)}${two(color.r)}${two(color.g)}${two(color.b)}'
      .toUpperCase();
}

/// Reads/writes the chosen theme (null = never chosen: follow the phone).
/// Synchronous on purpose: the first frame is drawn already in the saved
/// theme. Swappable like the language repository (local now; the account's
/// copy is kept by `PreferencesSyncController`).
abstract interface class AppThemeRepository {
  AppThemeId? read();

  Future<void> write(AppThemeId? id);
}

/// SharedPreferences-backed [AppThemeRepository]. The key is the old one:
/// `light` and `dark` saved by earlier versions read as Day and Night.
class LocalAppThemeRepository implements AppThemeRepository {
  const LocalAppThemeRepository(this._kv);

  final LocalKvStore _kv;

  @override
  AppThemeId? read() {
    final raw = _kv.getString(_kThemeKey);
    final id = AppThemes.fromWire(raw);
    // Owner 2026-10-22: the removed Glass theme (and the old `navy`) are
    // saved again under the new names, once.
    if (id != null && (raw == 'glass' || raw == 'navy')) {
      unawaited(_kv.setString(_kThemeKey, AppThemes.of(id).wire));
    }
    // R-112: phones that saved a theme before this key existed get the
    // colour once; afterwards it only changes in [write].
    _syncWindowBg(id);
    return id;
  }

  void _syncWindowBg(AppThemeId? id) {
    final want = id == null ? null : windowBgWire(AppThemes.of(id).tokens().bg);
    if (_kv.getString(kWindowBgKey) == want) return;
    unawaited(
      want == null
          ? _kv.remove(kWindowBgKey)
          : _kv.setString(kWindowBgKey, want),
    );
  }

  @override
  Future<void> write(AppThemeId? id) async {
    // The colour first: the native window must never lag the theme.
    if (id == null) {
      await _kv.remove(kWindowBgKey);
      await _kv.remove(_kThemeKey);
    } else {
      await _kv.setString(
        kWindowBgKey,
        windowBgWire(AppThemes.of(id).tokens().bg),
      );
      await _kv.setString(_kThemeKey, AppThemes.of(id).wire);
    }
  }
}
