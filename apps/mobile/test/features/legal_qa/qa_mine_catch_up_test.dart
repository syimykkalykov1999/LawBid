import 'package:dio/dio.dart';
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/cache/cache_database.dart';
import 'package:lawbid/core/cache/cache_providers.dart';
import 'package:lawbid/core/cache/http_cache_interceptor.dart'
    show readingFromPhoneOnly;
import 'package:lawbid/core/sync/synced_list_notifier.dart' show SyncedPage;
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/data/legal_qa_repository.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// Audit 17.11 (Q2): the server sends a «Mine» delta only to a client. An
/// attorney's «Mine» (the questions they answered) catches up by reading the
/// first page again, so a question leaves once its answer is deleted.
Question _q(String id) => Question(
      id: id,
      title: 'Question $id',
      body: 'Body $id',
      isAnonymous: false,
      isMine: false,
      answerCount: 1,
      canAnswer: true,
      createdAt: DateTime.now(),
    );

class _Repo extends LegalQaRepository {
  _Repo() : super(Dio());

  List<Question> page = [_q('a'), _q('b')];
  int pageReads = 0;
  int deltaReads = 0;

  @override
  Future<CursorPage<Question>> list(
    QuestionsQuery query, {
    String? cursor,
  }) async {
    // No saved copy on this phone: the list reads the server.
    if (readingFromPhoneOnly) throw StateError('no phone copy');
    pageReads++;
    return CursorPage(items: page);
  }

  @override
  Future<SyncedPage<Question>> listChangedSince(
    QuestionsQuery query,
    DateTime since,
  ) async {
    deltaReads++;
    // What the server answers an attorney: the plain list, no deletedIds.
    return SyncedPage(items: page);
  }
}

void main() {
  const mine = QuestionsQuery(filter: QaFilter.mine);

  Future<(ProviderContainer, _Repo)> boot({required bool attorney}) async {
    final repo = _Repo();
    final cache = CacheDatabase(NativeDatabase.memory());
    final c = ProviderContainer(
      overrides: [
        legalQaRepositoryProvider.overrideWithValue(repo),
        actsAsAttorneyProvider.overrideWithValue(attorney),
        cacheDatabaseProvider.overrideWithValue(cache),
        realtimeEventsProvider
            .overrideWithValue(const Stream<RealtimeEvent>.empty()),
      ],
    );
    addTearDown(() async {
      c.dispose();
      await cache.close();
    });
    final sub = c.listen(questionsProvider(mine), (_, __) {});
    addTearDown(sub.close);
    await c.read(questionsProvider(mine).future);
    return (c, repo);
  }

  Future<void> settle() =>
      Future<void>.delayed(const Duration(milliseconds: 900));

  test('attorney: a question whose answer I deleted leaves «Mine»', () async {
    final (c, repo) = await boot(attorney: true);
    expect(
      c.read(questionsProvider(mine)).value!.items.map((q) => q.id),
      ['a', 'b'],
    );

    repo.page = [_q('b')];
    c.read(questionsTouchedProvider.notifier).bump();
    await settle();

    expect(repo.deltaReads, 0, reason: 'the server has no attorney delta');
    expect(
      c.read(questionsProvider(mine)).value!.items.map((q) => q.id),
      ['b'],
    );
  });

  test('client: «Mine» still catches up with one updatedSince', () async {
    final (c, repo) = await boot(attorney: false);
    c.read(questionsTouchedProvider.notifier).bump();
    await settle();
    expect(repo.deltaReads, 1);
    expect(repo.pageReads, 1);
  });
}
