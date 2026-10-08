import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
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
  ContentTranslationRepository(Dio dio) : _client = api.TranslationsClient(dio);

  final api.TranslationsClient _client;

  /// The text of [kind] [id] in [target]; the server reads the original
  /// itself (and checks the person may see it).
  Future<String> translate(
    TranslatableKind kind,
    String id,
    String target,
  ) async =>
      (await guardApiCall(
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
}

final contentTranslationRepositoryProvider =
    Provider<ContentTranslationRepository>(
  (ref) => ContentTranslationRepository(ref.watch(dioProvider)),
);
