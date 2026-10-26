import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05: what «Перевести» can translate outside chats, and the
/// bootstrap flag of its zone (Ключи и сервисы → Google Translate).
enum TranslatableKind {
  post(api.TranslatableKind.post, 'translate_posts'),
  comment(api.TranslatableKind.comment, 'translate_posts'),
  caseDescription(api.TranslatableKind.valueCase, 'translate_cases'),
  bid(api.TranslatableKind.bid, 'translate_cases'),
  review(api.TranslatableKind.review, 'translate_reviews'),
  profile(api.TranslatableKind.profile, 'translate_profiles');

  const TranslatableKind(this.wire, this.flag);

  final api.TranslatableKind wire;
  final String flag;
}

class ContentTranslationRepository {
  ContentTranslationRepository(Dio dio, {CacheDatabase? cache, String? owner})
      : _client = api.TranslationsClient(dio),
        _cache = cache,
        _owner = owner;

  final api.TranslationsClient _client;
  final CacheDatabase? _cache;
  final String? _owner;

  /// The text of [kind] [id] in [target]; the server reads the original
  /// itself (and checks the person may see it). Owner 2026-10-22 (client
  /// economy plan, package K): a translation already on the phone is not
  /// asked for again (2 MB, least recently used out first).
  Future<String> translate(
    TranslatableKind kind,
    String id,
    String target,
  ) async {
    final cache = _cache;
    final owner = _owner;
    if (cache != null && owner != null) {
      try {
        final kept = await cache.translation(
          owner,
          kind.name,
          id,
          target,
          DateTime.now(),
        );
        if (kept != null) return kept;
      } on Object {
        // No copy: ask the server.
      }
    }
    final text = (await guardApiCall(
      () => _client.translate(
        body: api.TranslateContentDto(
          kind: kind.wire,
          id: id,
          target: target,
        ),
      ),
    ))
        .data
        .text;
    if (cache != null && owner != null) {
      unawaited(
        cache
            .putTranslation(
              owner: owner,
              kind: kind.name,
              id: id,
              target: target,
              body: text,
              now: DateTime.now(),
            )
            .catchError((Object _) {}),
      );
    }
    return text;
  }
}

final contentTranslationRepositoryProvider =
    Provider<ContentTranslationRepository>(
  (ref) => ContentTranslationRepository(
    ref.watch(dioProvider),
    cache: ref.watch(cacheDatabaseProvider),
    owner: ref.watch(sessionControllerProvider.select((s) => s?.sub)),
  ),
);
