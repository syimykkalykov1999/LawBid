import 'dart:async';

import 'package:lawbid/core/design_system/theme/app_theme_id.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';

const _kThemeKey = 'design_system.theme_mode';

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
    return id;
  }

  @override
  Future<void> write(AppThemeId? id) => id == null
      ? _kv.remove(_kThemeKey)
      : _kv.setString(_kThemeKey, AppThemes.of(id).wire);
}
