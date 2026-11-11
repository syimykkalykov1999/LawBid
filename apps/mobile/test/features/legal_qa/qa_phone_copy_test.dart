import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Owner 2026-11-11 (speed, Instagram / Telegram): the Q&A list opens at
/// once on the page this phone showed last time; the live page swaps in
/// behind it, no extra request. A search never shows the copy.
Question _q(String id) => Question(
      id: id,
      title: 'Question $id',
      body: 'Body',
      isAnonymous: false,
      isMine: false,
      answerCount: 0,
      canAnswer: true,
      createdAt: DateTime(2026, 11, 11),
      practiceArea: const QaPracticeArea(
        id: 'a1',
        i18nKey: 'qa.entry.hint',
        nameEn: 'Real estate',
      ),
      stateCode: 'NY',
      author: const QaPerson(id: 'u2', displayName: 'Anna K.'),
    );

class _Repo extends LegalQaRepository {
  _Repo() : super(Dio());

  final live = Completer<CursorPage<Question>>();
  CursorPage<Question>? copy;
  int liveReads = 0;

  @override
  Future<CursorPage<Question>> list(
    QuestionsQuery query, {
    String? cursor,
  }) async {
    if (readingFromPhoneOnly) {
      final c = copy;
      if (c == null) throw StateError(kNoPhoneCopy);
      return c;
    }
    liveReads++;
    return live.future;
  }
}

void main() {
  late _Repo repo;
  late ProviderContainer c;
  late StreamController<RealtimeEvent> events;

  setUp(() {
    repo = _Repo()..copy = CursorPage(items: [_q('old')]);
    events = StreamController<RealtimeEvent>.broadcast();
    c = ProviderContainer(
      overrides: [
        legalQaRepositoryProvider.overrideWithValue(repo),
        realtimeEventsProvider.overrideWithValue(events.stream),
      ],
    );
  });

  tearDown(() async {
    c.dispose();
    await events.close();
  });

  Future<void> settle() => Future<void>.delayed(Duration.zero);

  test('opens on the phone copy before the server answers', () async {
    final p = questionsProvider(const QuestionsQuery());
    c.listen(p, (_, __) {});
    final first = await c.read(p.future);
    expect(first.items.map((e) => e.id), ['old']);

    repo.live.complete(CursorPage(items: [_q('new'), _q('old')]));
    await settle();
    await settle();
    expect(c.read(p).requireValue.items.map((e) => e.id), ['new', 'old']);
    expect(repo.liveReads, 1);
  });

  test('a search waits for the server, no copy', () async {
    final p = questionsProvider(const QuestionsQuery(q: 'deposit'));
    c.listen(p, (_, __) {});
    final read = c.read(p.future);
    await settle();
    expect(c.read(p).isLoading, isTrue);
    repo.live.complete(CursorPage(items: [_q('found')]));
    expect((await read).items.map((e) => e.id), ['found']);
  });
}
