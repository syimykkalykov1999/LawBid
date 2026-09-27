import 'dart:async';

import 'package:flutter/material.dart' show ThemeMode;
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/theme/theme_mode_providers.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/language_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_providers.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';

const _kPendingTheme = 'prefs.sync.pending.theme';
const _kPendingLanguage = 'prefs.sync.pending.language';

/// `users.theme` wire value (apps/api `ThemePref`: system/light/dark).
String themeWireName(ThemeMode mode) => switch (mode) {
      ThemeMode.system => 'system',
      ThemeMode.light => 'light',
      ThemeMode.dark => 'dark',
    };

/// Inverse of [themeWireName]; the server default (`null`/unknown) is
/// `system` (`users.theme @default(system)`).
ThemeMode parseThemeWire(String? raw) => switch (raw) {
      'light' => ThemeMode.light,
      'dark' => ThemeMode.dark,
      _ => ThemeMode.system,
    };

/// Keeps the interface language and theme in sync with the account
/// (docs/07 §8.1: "выбор хранится локально и на сервере"; docs/01 §9.4
/// language choice; §15 stage 1.7 acceptance "язык и тема сохраняются").
/// Local storage stays the source for rendering (instant, works signed
/// out); this controller mirrors it to `PATCH /users/me {uiLanguage,
/// theme}` through [onboardingRepositoryProvider] (never dio directly).
///
/// Rules:
///   - signed in + the user changes theme/language → PATCH (only the
///     changed field, only when it differs from the account's value); the
///     returned MeView replaces `currentUserControllerProvider`'s user;
///   - signed out → local only;
///   - at login (a new user id appears):
///       * returning account (onboarding completed) → the SERVER values
///         are applied locally (a new device picks up the account's
///         language and theme);
///       * new account (onboarding not completed) → the LOCAL values are
///         pushed: the welcome-screen globe is where a new user picks the
///         language (docs/OPEN_QUESTIONS.md OQ-006 removed the onboarding
///         language step), so that choice must not be overwritten by the
///         server default `en`/`system`;
///   - a PATCH that fails (offline) leaves a local "pending" flag; the
///     local value then wins at the next login/refresh and is retried,
///     instead of being reverted by the stale server value. Flags are
///     cleared on logout so they never leak into another account.
class PreferencesSyncController extends Notifier<void> {
  String? _reconciledUserId;
  Future<void>? _pushing;

  LocalKvStore get _kv => ref.read(localKvStoreProvider);

  @override
  void build() {
    ref.listen<CurrentUser?>(
      currentUserControllerProvider.select((s) => s.user),
      (previous, next) => unawaited(_onUser(previous, next)),
      fireImmediately: true,
    );
    ref.listen<AsyncValue<ThemeMode>>(themeModeControllerProvider, (previous, next) {
      final before = previous?.value;
      final now = next.value;
      if (before == null || now == null || before == now) return;
      unawaited(_onLocalChange(theme: themeWireName(now)));
    });
    ref.listen<AsyncValue<AppLanguage>>(languageControllerProvider, (previous, next) {
      final before = previous?.value;
      final now = next.value;
      if (before == null || now == null || before == now) return;
      unawaited(_onLocalChange(uiLanguage: now.code));
    });
  }

  CurrentUser? get _user => ref.read(currentUserControllerProvider).user;

  Future<void> _onUser(CurrentUser? previous, CurrentUser? user) async {
    if (user == null) {
      _reconciledUserId = null;
      if (previous != null) {
        // Logout: an unsynced change belongs to the account that made it.
        await _kv.remove(_kPendingTheme);
        await _kv.remove(_kPendingLanguage);
      }
      return;
    }
    if (_reconciledUserId == user.id) {
      await _flushPending(user);
      return;
    }
    _reconciledUserId = user.id;
    await _reconcileAtLogin(user);
  }

  Future<void> _reconcileAtLogin(CurrentUser user) async {
    final ThemeMode localTheme;
    final AppLanguage localLanguage;
    try {
      localTheme = await ref.read(themeModeControllerProvider.future);
      localLanguage = await ref.read(languageControllerProvider.future);
    } on Object {
      return;
    }
    if (!ref.mounted) return;

    final pushLocal = !user.onboarding.isCompleted;
    final serverTheme = parseThemeWire(user.theme);
    final serverLanguage = AppLanguage.fromCode(user.uiLanguage);

    String? pushTheme;
    String? pushLanguage;

    if (localTheme != serverTheme) {
      if (pushLocal || _isPending(_kPendingTheme)) {
        pushTheme = themeWireName(localTheme);
      } else {
        await ref.read(themeModeControllerProvider.notifier).setThemeMode(serverTheme);
      }
    }
    // Either way the resolved language is persisted as an explicit choice,
    // so a later system-locale auto-detection can't silently change (and
    // PATCH) a signed-in account's language.
    final languages = ref.read(languageControllerProvider.notifier);
    if (localLanguage != serverLanguage && (pushLocal || _isPending(_kPendingLanguage))) {
      pushLanguage = localLanguage.code;
      await languages.setLanguage(localLanguage);
    } else if (AppLanguage.isValidCode(user.uiLanguage)) {
      await languages.setLanguage(serverLanguage);
    }
    if (!ref.mounted) return;
    if (pushTheme == null) await _kv.remove(_kPendingTheme);
    if (pushLanguage == null) await _kv.remove(_kPendingLanguage);
    if (pushTheme != null || pushLanguage != null) {
      await _push(theme: pushTheme, uiLanguage: pushLanguage);
    }
  }

  Future<void> _onLocalChange({String? theme, String? uiLanguage}) async {
    final user = _user;
    if (user == null) return;
    // A server value being applied locally (see _reconcileAtLogin) lands
    // here too; it already equals the account's value, so nothing is sent.
    final changedTheme = theme != null && theme != (user.theme ?? 'system') ? theme : null;
    final changedLanguage = uiLanguage != null && uiLanguage != user.uiLanguage ? uiLanguage : null;
    if (changedTheme == null && changedLanguage == null) return;
    await _push(theme: changedTheme, uiLanguage: changedLanguage);
  }

  /// Retries a pending change after a later `/users/me` refresh.
  Future<void> _flushPending(CurrentUser user) async {
    if (_pushing != null) return;
    String? theme;
    String? uiLanguage;
    if (_isPending(_kPendingTheme)) {
      final local = ref.read(themeModeControllerProvider).value;
      if (local != null && themeWireName(local) != (user.theme ?? 'system')) {
        theme = themeWireName(local);
      } else {
        await _kv.remove(_kPendingTheme);
      }
    }
    if (_isPending(_kPendingLanguage)) {
      final local = ref.read(languageControllerProvider).value;
      if (local != null && local.code != user.uiLanguage) {
        uiLanguage = local.code;
      } else {
        await _kv.remove(_kPendingLanguage);
      }
    }
    if (theme != null || uiLanguage != null) {
      await _push(theme: theme, uiLanguage: uiLanguage);
    }
  }

  Future<void> _push({String? theme, String? uiLanguage}) async {
    // Serialize: a second change while a PATCH is in flight waits for it,
    // so the server never ends up with the older of two quick changes.
    final previous = _pushing;
    if (previous != null) await previous;
    final future = _send(theme: theme, uiLanguage: uiLanguage);
    _pushing = future;
    try {
      await future;
    } finally {
      if (identical(_pushing, future)) _pushing = null;
    }
  }

  Future<void> _send({String? theme, String? uiLanguage}) async {
    if (theme != null) await _kv.setString(_kPendingTheme, '1');
    if (uiLanguage != null) await _kv.setString(_kPendingLanguage, '1');
    if (!ref.mounted || _user == null) return;
    try {
      final updated = await ref
          .read(onboardingRepositoryProvider)
          .updateProfile(theme: theme, uiLanguage: uiLanguage);
      if (!ref.mounted) return;
      if (theme != null) await _kv.remove(_kPendingTheme);
      if (uiLanguage != null) await _kv.remove(_kPendingLanguage);
      if (_user?.id == updated.id) {
        ref.read(currentUserControllerProvider.notifier).apply(updated);
      }
    } on ApiException catch (e) {
      // Offline: the pending flag stays and the change is retried (class
      // doc). A definitive server rejection (e.g. 400
      // I18N_LANGUAGE_NOT_FOUND for a language deactivated meanwhile) is
      // not retried forever — the next login applies the server value.
      if (!e.isNetworkError) {
        if (theme != null) await _kv.remove(_kPendingTheme);
        if (uiLanguage != null) await _kv.remove(_kPendingLanguage);
      }
    } on Object {
      // Unexpected failure: keep the pending flag, retry later.
    }
  }

  bool _isPending(String key) => _kv.getString(key) != null;
}

final preferencesSyncProvider =
    NotifierProvider<PreferencesSyncController, void>(PreferencesSyncController.new);
