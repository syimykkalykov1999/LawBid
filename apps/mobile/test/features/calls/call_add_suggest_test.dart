import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_group.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-21 (inbox 25, Instagram): «Add participant» suggests
/// anyone in the app while a name or @username is typed; a tap adds them.
/// The size of the call and the «Requests» gate say why a person was not
/// added.
const _t = StaticTranslatorEn();

const _people = [
  SuggestedPerson(id: 'p1', username: 'thomas', name: 'Thomas Anderson'),
  SuggestedPerson(id: 'p2', username: 'neo_one', name: 'Anna Smith'),
  SuggestedPerson(id: 'u1', username: 'already', name: 'Thomas In Call'),
];

/// Matches by @username or name, like the server.
Future<List<SuggestedPerson>> _search(String q) async {
  final s = q.toLowerCase();
  return [
    for (final p in _people)
      if (p.username.contains(s) || p.name.toLowerCase().contains(s)) p,
  ];
}

class _Fake extends CallController {
  _Fake(this.session, {this.reply});

  final CallSession session;

  /// What the server answers to an invite (null = added).
  final String? reply;
  final invited = <String>[];

  @override
  CallSession build() => session;

  @override
  Future<String?> invite({String? userId, String? username}) async {
    invited.add(userId ?? '@$username');
    return reply;
  }
}

CallSession _session({int people = 3, bool video = false}) => CallSession(
      phase: CallPhase.active,
      connectedAt: DateTime.now(),
      video: video,
      call: AppCall(
        id: 'c',
        conversationId: 'x',
        status: CallStatus.active,
        outgoing: true,
        video: video,
        peer: const CallPeer(id: 'u1', isAttorney: false, displayName: 'P'),
        createdAt: DateTime.now(),
        group: true,
        hostId: 'u0',
        participants: [
          for (var i = 0; i < people; i++)
            CallMember(userId: 'u$i', status: CallMemberStatus.joined),
        ],
      ),
    );

Future<_Fake> _open(
  WidgetTester tester, {
  CallSession? session,
  String? reply,
}) async {
  final fake = _Fake(session ?? _session(), reply: reply);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...uxOverrides(),
        callMyIdProvider.overrideWithValue('u0'),
        callContactPickerProvider.overrideWithValue(null),
        callControllerProvider.overrideWith(() => fake),
        peopleSuggestSearchProvider.overrideWithValue(_search),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showAddToCallSheet(context),
              child: const Text('open'),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.tap(find.text('open'));
  await tester.pumpAndSettle();
  return fake;
}

Future<void> _type(WidgetTester tester, String text) async {
  await tester.enterText(find.byKey(const ValueKey('call-add-field')), text);
  await tester.pump(peopleSuggestDebounce);
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('typing a @username lists the person; a tap adds them',
      (tester) async {
    final fake = await _open(tester);
    await _type(tester, '@thom');
    expect(find.text('Thomas Anderson'), findsOneWidget);
    expect(find.textContaining('thomas'), findsOneWidget);
    // Already in the call: not suggested.
    expect(find.text('Thomas In Call'), findsNothing);
    await tester.tap(find.byKey(const ValueKey('people-suggest-p1')));
    await tester.pumpAndSettle();
    expect(fake.invited, ['p1']);
    // Added: the sheet closes.
    expect(find.byKey(const ValueKey('call-add-field')), findsNothing);
  });

  testWidgets('a name finds the person too (not only @username)',
      (tester) async {
    await _open(tester);
    await _type(tester, 'anna');
    expect(find.text('Anna Smith'), findsOneWidget);
    expect(find.textContaining('neo_one'), findsOneWidget);
    expect(find.text('Thomas Anderson'), findsNothing);
  });

  testWidgets('one letter asks nothing; no match says so', (tester) async {
    await _open(tester);
    await _type(tester, 't');
    expect(find.byType(PersonSuggestionTile), findsNothing);
    await _type(tester, 'zzz');
    expect(find.byKey(const ValueKey('people-suggest-empty')), findsOneWidget);
    expect(find.text(_t.t('search.empty.title')), findsOneWidget);
  });

  testWidgets('the «Requests» gate refusal is said under the field',
      (tester) async {
    final fake = await _open(tester, reply: 'CALL_NOT_ALLOWED');
    await _type(tester, 'thomas');
    await tester.tap(find.byKey(const ValueKey('people-suggest-p1')));
    await tester.pumpAndSettle();
    expect(fake.invited, ['p1']);
    expect(find.text(_t.t('call.notAllowedRequest')), findsOneWidget);
    // Still open: another person can be picked.
    expect(find.byKey(const ValueKey('people-suggest-p1')), findsOneWidget);
  });

  testWidgets('a full call (server) names the limit', (tester) async {
    await _open(tester, reply: 'CALL_STATE_CONFLICT');
    await _type(tester, 'thomas');
    await tester.tap(find.byKey(const ValueKey('people-suggest-p1')));
    await tester.pumpAndSettle();
    expect(
      find.text(_t.t('call.fullMax', {'count': '9'})),
      findsOneWidget,
    );
  });

  testWidgets('a full video call (6) shows the limit instead of the field',
      (tester) async {
    await _open(tester, session: _session(people: 6, video: true));
    expect(find.byKey(const ValueKey('call-add-full')), findsOneWidget);
    expect(find.text(_t.t('call.fullMax', {'count': '6'})), findsOneWidget);
    expect(find.byKey(const ValueKey('call-add-field')), findsNothing);
  });

  testWidgets('an audio call holds 9: 8 people still may add', (tester) async {
    await _open(tester, session: _session(people: 8));
    expect(find.byKey(const ValueKey('call-add-field')), findsOneWidget);
  });

  test('call capacity follows the server (9 audio / 6 video)', () {
    expect(_session(people: 9).call!.full, isTrue);
    expect(_session(people: 8).call!.full, isFalse);
    expect(_session(people: 6, video: true).call!.full, isTrue);
    expect(_session(people: 5, video: true).call!.capacity, 6);
  });
}
