import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_add_panel.dart';
import 'package:lawbid/shared/people/my_people.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (WhatsApp «Add participant»): the panel slides in with
/// my contacts, my chats, then mutual follows; a search box filters them;
/// people in the call say «In call» and cannot be invited again; «Invite»
/// goes through the call's invite; a full call says so in every row.
const _t = StaticTranslatorEn();

const _people = [
  MyPerson(
    id: 'm1',
    group: MyPeopleGroup.mutual,
    name: 'Mira Mutual',
    username: 'mira',
  ),
  MyPerson(
    id: 'c1',
    group: MyPeopleGroup.contacts,
    name: 'Carl Contact',
    username: 'carl',
  ),
  MyPerson(
    id: 'h1',
    group: MyPeopleGroup.chats,
    name: 'Anna Smith',
    username: 'neo_one',
  ),
  MyPerson(
    id: 'u1',
    group: MyPeopleGroup.chats,
    name: 'Peter In Call',
    username: 'peter',
  ),
];

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

CallSession _group({int people = 3, bool video = false}) => CallSession(
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

/// A one-to-one call with u1 (no participants list).
CallSession _oneToOne() => CallSession(
      phase: CallPhase.active,
      connectedAt: DateTime.now(),
      call: AppCall(
        id: 'c',
        conversationId: 'x',
        status: CallStatus.active,
        outgoing: true,
        peer: const CallPeer(id: 'u1', isAttorney: true, displayName: 'P'),
        createdAt: DateTime.now(),
      ),
    );

Future<_Fake> _open(
  WidgetTester tester, {
  CallSession? session,
  String? reply,
  List<MyPerson> people = _people,
}) async {
  final fake = _Fake(session ?? _group(), reply: reply);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        ...uxOverrides(),
        callMyIdProvider.overrideWithValue('u0'),
        callControllerProvider.overrideWith(() => fake),
        myPeopleProvider.overrideWith((_) async => people),
      ],
      child: MaterialApp(
        theme: AppTheme.dark(),
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () => showAddToCallPanel(context),
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

Finder _row(String id) => find.byKey(ValueKey('call-add-row-$id'));

void main() {
  testWidgets('contacts first, then chats, then mutual follows',
      (tester) async {
    await _open(tester);
    double y(Finder f) => tester.getTopLeft(f).dy;
    expect(find.byType(CallAddPanel), findsOneWidget);
    final contacts = find.byKey(const ValueKey('call-add-section-contacts'));
    final chats = find.byKey(const ValueKey('call-add-section-chats'));
    final mutual = find.byKey(const ValueKey('call-add-section-mutual'));
    expect(find.text(_t.t('call.people.contacts')), findsOneWidget);
    expect(find.text(_t.t('call.people.chats')), findsOneWidget);
    expect(find.text(_t.t('call.people.mutual')), findsOneWidget);
    expect(y(contacts), lessThan(y(_row('c1'))));
    expect(y(_row('c1')), lessThan(y(chats)));
    expect(y(chats), lessThan(y(_row('h1'))));
    expect(y(_row('h1')), lessThan(y(mutual)));
    expect(y(mutual), lessThan(y(_row('m1'))));
    // Name and @username on each row.
    expect(find.text('Carl Contact'), findsOneWidget);
    expect(find.textContaining('carl'), findsOneWidget);
  });

  testWidgets('the search filters by name or @username', (tester) async {
    await _open(tester);
    final field = find.byKey(const ValueKey('call-add-search'));
    await tester.enterText(field, 'anna');
    await tester.pumpAndSettle();
    expect(_row('h1'), findsOneWidget);
    expect(_row('c1'), findsNothing);
    expect(_row('m1'), findsNothing);
    // Only the group that still has someone keeps its heading.
    expect(
      find.byKey(const ValueKey('call-add-section-contacts')),
      findsNothing,
    );
    await tester.enterText(field, '@mir');
    await tester.pumpAndSettle();
    expect(_row('m1'), findsOneWidget);
    expect(_row('h1'), findsNothing);
    await tester.enterText(field, 'zzz');
    await tester.pumpAndSettle();
    expect(find.text(_t.t('call.people.noMatch')), findsOneWidget);
  });

  testWidgets('a person in the call says «In call» and cannot be invited',
      (tester) async {
    final fake = await _open(tester);
    expect(find.byKey(const ValueKey('call-add-state-u1')), findsOneWidget);
    expect(find.text(_t.t('call.inCall')), findsOneWidget);
    expect(find.byKey(const ValueKey('call-add-invite-u1')), findsNothing);
    await tester.tap(_row('u1'));
    await tester.pumpAndSettle();
    expect(fake.invited, isEmpty);
  });

  testWidgets('«Invite» goes through the call; the row then says «In call»',
      (tester) async {
    final fake = await _open(tester);
    await tester.tap(find.byKey(const ValueKey('call-add-invite-c1')));
    await tester.pumpAndSettle();
    expect(fake.invited, ['c1']);
    // The panel stays open for the next person.
    expect(find.byType(CallAddPanel), findsOneWidget);
    expect(find.byKey(const ValueKey('call-add-state-c1')), findsOneWidget);
    // A tap on a row invites too.
    await tester.tap(_row('m1'));
    await tester.pumpAndSettle();
    expect(fake.invited, ['c1', 'm1']);
  });

  testWidgets('a refusal is said on top of the list', (tester) async {
    final fake = await _open(tester, reply: 'CALL_NOT_ALLOWED');
    await tester.tap(find.byKey(const ValueKey('call-add-invite-h1')));
    await tester.pumpAndSettle();
    expect(fake.invited, ['h1']);
    expect(find.byKey(const ValueKey('call-add-error')), findsOneWidget);
    expect(find.text(_t.t('call.notAllowedRequest')), findsOneWidget);
    // Not added: still invitable.
    expect(find.byKey(const ValueKey('call-add-invite-h1')), findsOneWidget);
  });

  testWidgets('a full call (9) says so and every row is closed',
      (tester) async {
    final fake = await _open(tester, session: _group(people: 9, video: true));
    expect(find.byKey(const ValueKey('call-add-full')), findsOneWidget);
    expect(find.text(_t.t('call.fullMax', {'count': '9'})), findsOneWidget);
    expect(find.byKey(const ValueKey('call-add-invite-c1')), findsNothing);
    expect(find.text(_t.t('call.full')), findsNWidgets(3));
    await tester.tap(_row('c1'));
    await tester.pumpAndSettle();
    expect(fake.invited, isEmpty);
  });

  testWidgets('a 1:1 call: the other person is «In call»', (tester) async {
    final fake = await _open(tester, session: _oneToOne());
    expect(find.byKey(const ValueKey('call-add-state-u1')), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('call-add-invite-h1')));
    await tester.pumpAndSettle();
    expect(fake.invited, ['h1']);
  });

  testWidgets('nobody yet: says where people come from', (tester) async {
    await _open(tester, people: const []);
    expect(find.byKey(const ValueKey('call-add-empty')), findsOneWidget);
    expect(find.text(_t.t('call.people.empty')), findsOneWidget);
  });

  testWidgets('× closes the panel', (tester) async {
    await _open(tester);
    await tester.tap(find.byKey(const ValueKey('call-add-close')));
    await tester.pumpAndSettle();
    expect(find.byType(CallAddPanel), findsNothing);
  });
}
