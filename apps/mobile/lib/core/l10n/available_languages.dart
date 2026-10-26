import 'dart:async';
import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/i18n_api_client.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/persistence/local_kv_store.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';

const _kActiveLanguagesKey = 'l10n.languages.active';

/// One active interface language as the server reports it
/// (`GET /i18n/languages`, docs/01_FOUNDATION_AUTH.md §9.3) — the
/// client-side model, cached locally so the list (and a server-only
/// language the user picked) survives an offline cold start.
@immutable
class ServerLanguage {
  const ServerLanguage({
    required this.code,
    required this.nameNative,
    this.isRtl = false,
    this.sort = 0,
  });

  factory ServerLanguage.fromDto(I18nLanguageDto dto) => ServerLanguage(
        code: AppLanguage.normalizeCode(dto.code),
        nameNative: dto.nameNative,
        isRtl: dto.isRtl,
        sort: dto.sort,
      );

  factory ServerLanguage.fromJson(Map<String, dynamic> json) => ServerLanguage(
        code: json['code'] as String,
        nameNative: json['nameNative'] as String,
        isRtl: json['isRtl'] as bool? ?? false,
        sort: json['sort'] as int? ?? 0,
      );

  final String code;
  final String nameNative;
  final bool isRtl;
  final int sort;

  Map<String, Object> toJson() => {
        'code': code,
        'nameNative': nameNative,
        'isRtl': isRtl,
        'sort': sort,
      };

  @override
  bool operator ==(Object other) =>
      other is ServerLanguage &&
      other.code == code &&
      other.nameNative == nameNative &&
      other.isRtl == isRtl &&
      other.sort == sort;

  @override
  int get hashCode => Object.hash(code, nameNative, isRtl, sort);
}

/// SharedPreferences-backed cache of the last successful
/// `GET /i18n/languages` response. Unreadable/corrupt data reads as
/// "never fetched" (`null`), never throws.
class ActiveLanguagesCache {
  const ActiveLanguagesCache(this._kv);

  final LocalKvStore _kv;

  List<ServerLanguage>? read() {
    final raw = _kv.getString(_kActiveLanguagesKey);
    if (raw == null) return null;
    try {
      final decoded = jsonDecode(raw);
      if (decoded is! List) return null;
      return decoded
          .whereType<Map<String, dynamic>>()
          .map(ServerLanguage.fromJson)
          .where((l) => AppLanguage.isValidCode(l.code))
          .toList(growable: false);
    } on Object {
      return null;
    }
  }

  Future<void> write(List<ServerLanguage> languages) => _kv.setString(
        _kActiveLanguagesKey,
        jsonEncode(languages.map((l) => l.toJson()).toList(growable: false)),
      );
}

final activeLanguagesCacheProvider = Provider<ActiveLanguagesCache>(
  (ref) => ActiveLanguagesCache(ref.watch(localKvStoreProvider)),
);

/// The server's active-language list — `null` until it has been fetched
/// at least once on this device (then the cached copy is used on every
/// later cold start, refreshed in the background by [refresh]).
///
/// This is what makes docs/01 §15 stage 1.6's acceptance ("новый язык,
/// импортированный через xlsx, появляется в приложении без пересборки")
/// hold: the backend's import creates the language row active
/// (`I18nImportService`), it shows up here on the next refresh, and
/// [selectableLanguageCodes] makes it pickable — no client release.
class ActiveLanguagesController extends Notifier<List<ServerLanguage>?> {
  Future<bool>? _inFlight;

  @override
  List<ServerLanguage>? build() =>
      ref.read(activeLanguagesCacheProvider).read();

  /// Fetches `GET /i18n/languages`; on success updates state + cache and
  /// returns `true`. Never throws — offline/backend errors keep the cached
  /// list and return `false`. Concurrent calls share one request.
  Future<bool> refresh() =>
      _inFlight ??= _fetch().whenComplete(() => _inFlight = null);

  Future<bool> _fetch() async {
    try {
      final dtos = await ref.read(i18nApiClientProvider).getLanguages();
      final languages = dtos
          .where((d) => d.isActive && AppLanguage.isValidCode(d.code))
          .map(ServerLanguage.fromDto)
          .toList()
        ..sort((a, b) => a.sort.compareTo(b.sort));
      if (!ref.mounted) return false;
      if (!listEquals(languages, state)) state = List.unmodifiable(languages);
      await ref.read(activeLanguagesCacheProvider).write(languages);
      return true;
    } on Object {
      return false;
    }
  }
}

final activeLanguagesControllerProvider =
    NotifierProvider<ActiveLanguagesController, List<ServerLanguage>?>(
  ActiveLanguagesController.new,
);

/// Codes the user can switch to right now:
///   - server list unknown (never fetched, offline first launch) → the
///     compiled-in languages ([AppLanguage.values]);
///   - server list known → every active server language, plus `en`
///     (always: it's the mandatory fallback, §9.1/§9.3).
Set<String> selectableLanguageCodes(List<ServerLanguage>? server) {
  if (server == null) return {for (final l in AppLanguage.values) l.code};
  return {AppLanguage.fallback.code, for (final l in server) l.code};
}
