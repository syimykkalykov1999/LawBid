import 'dart:async';
import 'dart:io';
import 'dart:math';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../l10n/app_language.dart';
import '../l10n/language_providers.dart';
import '../persistence/persistence_providers.dart';

const _kDeviceIdKey = 'network.device_id';

/// Injects headers every backend request needs regardless of endpoint
/// (docs/01_FOUNDATION_AUTH.md §10.4): `X-Platform`, `X-App-Version`,
/// `Accept-Language`, `X-Device-Id`.
///
/// `X-Device-Id` is generated once (a locally-built v4-ish UUID — no `uuid`
/// package dependency added just for this one id) and persisted through the
/// existing `LocalKvStore`/SharedPreferences wrapper. It isn't a secret —
/// it exists only so the backend's session/device-info columns and the
/// refresh grace-window match (`RefreshTokenDto`'s doc comment in apps/api)
/// have something stable to key on — so plain SharedPreferences is enough,
/// no secure storage needed. [resolveDeviceId] and the other members are
/// `static` so `deviceInfoProvider`
/// (features/auth/application/auth_providers.dart) can reuse the exact same
/// id/platform/version in request bodies, not just this header.
class HeadersInterceptor extends Interceptor {
  HeadersInterceptor(this._ref);

  final Ref _ref;

  /// Keep in sync with pubspec.yaml's `version:` field.
  static const appVersion = '0.1.0';

  static String get platformName => Platform.isIOS ? 'ios' : 'android';

  @override
  void onRequest(RequestOptions options, RequestInterceptorHandler handler) {
    options.headers['X-Platform'] = platformName;
    options.headers['X-App-Version'] = appVersion;
    options.headers['Accept-Language'] = _languageTag(_ref);
    options.headers['X-Device-Id'] = resolveDeviceId(_ref);
    handler.next(options);
  }

  static String _languageTag(Ref ref) {
    final language = ref.read(languageControllerProvider).value ?? AppLanguage.en;
    return language == AppLanguage.ru ? 'ru' : 'en';
  }

  static String resolveDeviceId(Ref ref) {
    final kv = ref.read(localKvStoreProvider);
    final existing = kv.getString(_kDeviceIdKey);
    if (existing != null) return existing;
    final generated = _generateUuid();
    unawaited(kv.setString(_kDeviceIdKey, generated));
    return generated;
  }

  static String _generateUuid() {
    final random = Random.secure();
    final bytes = List<int>.generate(16, (_) => random.nextInt(256));
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 10xx
    String hex(int start, int end) => bytes
        .sublist(start, end)
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
    return '${hex(0, 4)}-${hex(4, 6)}-${hex(6, 8)}-${hex(8, 10)}-${hex(10, 16)}';
  }
}
