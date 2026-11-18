import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/features/translation/data/content_translation_repository.dart';

/// Verify 17.11 T3: the phone's translation cache is keyed by the source
/// text too — an edited post / comment / bio is translated again.
void main() {
  late CacheDatabase db;
  late List<String> served;
  late Dio dio;

  setUp(() {
    db = CacheDatabase(NativeDatabase.memory());
    served = [];
    dio = Dio(BaseOptions(baseUrl: 'http://test'))
      ..interceptors.add(
        InterceptorsWrapper(
          onRequest: (o, h) {
            final text = 'tr${served.length + 1}';
            served.add(text);
            h.resolve(
              Response<Map<String, dynamic>>(
                requestOptions: o,
                statusCode: 200,
                data: {
                  'data': {
                    'text': text,
                    'sourceLanguage': 'en',
                    'targetLanguage': 'ru',
                  },
                },
              ),
            );
          },
        ),
      );
  });

  tearDown(() => db.close());

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 50));

  test('same text: from the phone; edited text: asked again', () async {
    final repo = ContentTranslationRepository(dio, cache: db, owner: 'u1');
    expect(
      await repo.translate(TranslatableKind.post, 'p1', 'ru', source: 'Hello'),
      'tr1',
    );
    await settle();
    expect(
      await repo.translate(TranslatableKind.post, 'p1', 'ru', source: 'Hello'),
      'tr1',
    );
    expect(served, hasLength(1));
    expect(
      await repo.translate(
        TranslatableKind.post,
        'p1',
        'ru',
        source: 'Hello (edited)',
      ),
      'tr2',
    );
    expect(served, hasLength(2));
  });
}
