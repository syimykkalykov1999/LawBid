import 'package:drift/native.dart';
import 'package:flutter_riverpod/misc.dart';

import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_local_database.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

/// In-memory [CasesRepository]: lists return [myCases] / empty pages;
/// everything else records the call. Enough for screens that only list.
class FakeCasesRepository implements CasesRepository {
  FakeCasesRepository({this.myCasesItems = const []});

  final List<CaseSummary> myCasesItems;
  final List<String> calls = [];

  CursorPage<T> _empty<T>() => CursorPage<T>(items: const []);

  @override
  Future<CursorPage<CaseSummary>> myCases(MyCasesFilter filter, {String? cursor}) async {
    calls.add('myCases:${filter.name}');
    return CursorPage(items: filter == MyCasesFilter.active ? myCasesItems : const []);
  }

  @override
  Future<CursorPage<CaseBid>> caseBids(String caseId, BidsSort sort, {String? cursor}) async => _empty();

  @override
  Future<CursorPage<FeedCase>> feed({String? cursor, String? practiceAreaId, String? state}) async => _empty();

  @override
  Future<CursorPage<MyBid>> myBids(MyBidsFilter filter, {String? cursor}) async => _empty();

  @override
  Future<CursorPage<WorkItem>> myWork(WorkFilter filter, {String? cursor}) async => _empty();

  @override
  Future<CursorPage<SavedCase>> savedCases({String? cursor}) async => _empty();

  @override
  Future<CursorPage<HistoryCase>> history(String reauthToken, {String? cursor}) async => _empty();

  @override
  dynamic noSuchMethod(Invocation invocation) {
    calls.add(invocation.memberName.toString());
    return Future<Never>.error(UnimplementedError('$invocation'));
  }
}

/// Overrides every docs/04 dependency with fakes (no network, no disk).
List<Override> casesOverrides({FakeCasesRepository? repo}) => [
      casesRepositoryProvider.overrideWithValue(repo ?? FakeCasesRepository()),
      casesLocalDatabaseProvider.overrideWith((ref) {
        final db = CasesLocalDatabase(NativeDatabase.memory());
        ref.onDispose(db.close);
        return db;
      }),
    ];

/// A draft helper for wizard tests.
CaseDraft completeDraft() => const CaseDraft(
      practiceAreaId: 'leaf-1',
      practiceI18nKey: 'practice.traffic',
      practiceNameEn: 'Traffic',
      title: 'Speeding ticket in Trenton',
      description: 'Got a ticket on the turnpike last week driving home late.',
      primaryStateCode: 'NJ',
      step: 4,
    );
