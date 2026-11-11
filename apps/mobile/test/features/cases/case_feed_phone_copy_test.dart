import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

import 'cases_fakes.dart';

FeedCase _case(String id) => FeedCase(
      id: id,
      title: 'Speeding ticket',
      practice: const PracticeRef(
        id: 'p1',
        code: 'general_practice.not_sure_or_other',
        i18nKey: 'practice.general_practice.not_sure_or_other',
        nameEn: 'Not sure',
      ),
      primaryStateCode: 'CA',
      additionalStateCodes: const [],
      city: null,
      status: CaseStatus.open,
      budget: const CaseBudget(mode: BudgetMode.clarifyLater),
      viewCount: 1,
      bidsCount: 0,
      createdAt: DateTime(2026, 10, 4),
      isNew: true,
      hasOwnBid: false,
      description: 'A ticket on I-5, need help.',
    );

/// Owner 2026-11-08 (speed everywhere, SPEED_MATRIX §3 №2): the case feed
/// and «Исследовать» open on the phone's copy of their first page at once
/// (cold start, offline, a slow network); the live page replaces it later.
void main() {
  late FakeCasesRepository repo;
  late ProviderContainer container;

  setUp(() {
    repo = FakeCasesRepository()
      ..feedPhoneCopy = [_case('kept-1')]
      ..feedGate = Completer<void>();
    container = ProviderContainer(
      overrides: [casesRepositoryProvider.overrideWithValue(repo)],
    );
    addTearDown(container.dispose);
  });

  test('the feed shows the kept first page before the network answers',
      () async {
    const filter = (practiceCategory: null, state: null, mineOnly: true);
    final sub = container.listen(caseFeedProvider(filter), (_, __) {});
    addTearDown(sub.close);
    final first = await container
        .read(caseFeedProvider(filter).future)
        .timeout(const Duration(seconds: 2));
    expect(first.items.map((c) => c.id), ['kept-1']);
    // The live page is asked for in the background, after the copy is shown.
    await Future<void>.delayed(Duration.zero);
    expect(repo.calls, contains('feed'));
  });

  test('«Исследовать» shows the kept first page before the network answers',
      () async {
    const key = (
      practiceCategory: null,
      state: null,
      extras: CaseFeedExtras(),
    );
    final sub = container.listen(exploreCasesProvider(key), (_, __) {});
    addTearDown(sub.close);
    final first = await container
        .read(exploreCasesProvider(key).future)
        .timeout(const Duration(seconds: 2));
    expect(first.items.map((c) => c.id), ['kept-1']);
    await Future<void>.delayed(Duration.zero);
    expect(repo.calls, contains('feed'));
  });
}
