import 'dart:async';

import 'package:fake_async/fake_async.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/groups/application/people_candidates.dart';
import 'package:lawbid/features/groups/presentation/widgets/people_picker.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-21 (inbox 25b): the one people type-ahead of the app.
void main() {
  group('PeopleSuggestController', () {
    test('waits for two characters, strips «@», debounces', () {
      fakeAsync((async) {
        final asked = <String>[];
        final c = PeopleSuggestController((q) async {
          asked.add(q);
          return const [];
        })
          ..update('@t');
        async.elapse(const Duration(seconds: 1));
        expect(asked, isEmpty);
        expect(c.active, isFalse);
        c
          ..update('@th')
          ..update('@tho')
          ..update('@thom');
        async.elapse(peopleSuggestDebounce);
        expect(asked, ['thom']);
        c.dispose();
      });
    });

    test('a stale answer is dropped; answers are remembered', () {
      fakeAsync((async) {
        final slow = Completer<List<SuggestedPerson>>();
        var calls = 0;
        final c = PeopleSuggestController((q) {
          calls++;
          if (q == 'ann') return slow.future;
          return Future.value([SuggestedPerson(id: q, username: q)]);
        })
          ..update('ann');
        async.elapse(peopleSuggestDebounce);
        c.update('anna');
        async.elapse(peopleSuggestDebounce);
        expect(c.results.single.id, 'anna');
        slow.complete(const [SuggestedPerson(id: 'old', username: 'old')]);
        async.flushMicrotasks();
        expect(c.results.single.id, 'anna');
        // Back to a query already answered: no new call.
        c
          ..update('an')
          ..update('anna');
        async.elapse(peopleSuggestDebounce);
        expect(calls, 2);
        expect(c.results.single.id, 'anna');
        c.dispose();
      });
    });

    test('too short for the server = nothing found, not an error', () {
      fakeAsync((async) {
        final c = PeopleSuggestController(
          (q) => Future.error(
            const ApiException(code: 'SEARCH_QUERY_TOO_SHORT', message: ''),
          ),
        )..update('a.');
        async.elapse(peopleSuggestDebounce);
        expect(c.error, isNull);
        expect(c.results, isEmpty);
        c.dispose();
      });
    });

    test('an error is kept for the list; retry asks again', () {
      fakeAsync((async) {
        var fail = true;
        final c = PeopleSuggestController((q) async {
          if (fail) throw const ApiException(code: 'X', message: '');
          return [SuggestedPerson(id: q, username: q)];
        })
          ..update('bob');
        async.elapse(peopleSuggestDebounce);
        expect(c.error, isNotNull);
        fail = false;
        c.retry();
        async.elapse(peopleSuggestDebounce);
        expect(c.error, isNull);
        expect(c.results.single.id, 'bob');
        c.dispose();
      });
    });
  });

  testWidgets('group people picker: anyone in the app below my chats',
      (tester) async {
    final picked = <PickedPerson>[];
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          ...uxOverrides(),
          groupPeopleCandidatesProvider.overrideWith(
            (ref) async => const [
              PickedPerson(userId: 'c1', name: 'Anna From Chats'),
            ],
          ),
          peopleSuggestSearchProvider.overrideWithValue(
            (q) async => const [
              SuggestedPerson(id: 'c1', username: 'anna_c', name: 'Anna'),
              SuggestedPerson(
                id: 's1',
                username: 'anna_new',
                name: 'Anna Stranger',
              ),
            ],
          ),
        ],
        child: MaterialApp(
          theme: AppTheme.dark(),
          home: Scaffold(
            body: StatefulBuilder(
              builder: (context, setState) => PeopleSelector(
                selected: picked,
                onToggle: (p) => setState(() => picked.add(p)),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    await tester.enterText(find.byKey(const ValueKey('people-search')), 'ann');
    await tester.pump(peopleSuggestDebounce);
    await tester.pumpAndSettle();
    expect(find.text('Anna From Chats'), findsWidgets);
    // Already listed from my chats: not suggested twice.
    expect(find.byKey(const ValueKey('people-suggest-c1')), findsNothing);
    expect(find.text('Anna Stranger'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('people-suggest-s1')));
    await tester.pumpAndSettle();
    expect(picked.single.userId, 's1');
    expect(picked.single.name, 'Anna Stranger');
  });
}
