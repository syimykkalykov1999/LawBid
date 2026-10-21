import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/forward.dart';
import 'package:lawbid/features/chat/presentation/forward_sheet.dart';
import 'package:lawbid/features/chat/presentation/message_actions.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/people/people_suggest_list.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

/// Owner 2026-10-21 (Telegram «Переслать»): every forward is one server
/// request (never the outbox), disappearing messages are not offered, and
/// the target sheet lists chats and groups, greying out where I cannot
/// write.
class _Chats implements ChatRepository {
  _Chats({this.answer});

  final List<ForwardResult> Function(List<ForwardTarget>)? answer;
  final batches = <({List<ForwardSource> sources, List<ForwardTarget> to})>[];
  int plainSends = 0;

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(
        items: [
          _conv('c1', 'Anna Petrova'),
          _conv('c2', 'Closed Case', status: ConversationStatus.closed),
        ],
      );

  @override
  Future<List<ForwardResult>> forwardBatch(
    String requestId,
    List<ForwardSource> sources,
    List<ForwardTarget> targets,
  ) async {
    batches.add((sources: sources, to: targets));
    return answer?.call(targets) ??
        [
          for (final t in targets)
            for (final s in sources)
              ForwardResult(target: t, sourceId: s.id, sent: true),
        ];
  }

  @override
  Future<ChatMessage> send(
    String id,
    String clientMessageId,
    String body, {
    String? replyToId,
    bool forwarded = false,
  }) async {
    plainSends++;
    throw StateError('a forward must not be a plain send');
  }

  final started = <String>[];

  @override
  Future<Conversation> startDirect(String userId) async {
    started.add(userId);
    return _conv('dm-$userId', userId);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

Conversation _conv(
  String id,
  String name, {
  ConversationStatus status = ConversationStatus.active,
}) =>
    Conversation(
      id: id,
      caseId: null,
      caseTitle: null,
      status: status,
      isDirect: true,
      contactsUnlocked: true,
      counterpart: Counterpart(
        id: 'u-$id',
        displayName: name,
        isAttorney: false,
        verified: false,
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
    );

ChatMessage _msg(
  String id,
  MessageKind kind, {
  int minutes = 0,
  DateTime? expiresAt,
}) =>
    ChatMessage(
      id: id,
      conversationId: 'c0',
      kind: kind,
      body: 'b-$id',
      createdAt: DateTime(2026, 10, 21, 10, minutes),
      expiresAt: expiresAt,
    );

const _en = StaticTranslatorEn();

void main() {
  test('cards and places can be forwarded; disappearing messages never', () {
    for (final k in [
      MessageKind.text,
      MessageKind.voice,
      MessageKind.attachment,
      MessageKind.sticker,
      MessageKind.contact,
      MessageKind.place,
    ]) {
      expect(canForward(_msg('a', k)), isTrue, reason: '$k');
    }
    expect(canForward(_msg('g', MessageKind.gift)), isFalse);
    expect(
      canForward(
        _msg('d', MessageKind.text, expiresAt: DateTime(2030)),
      ),
      isFalse,
    );
  });

  Future<WidgetRef> pump(
    WidgetTester tester,
    _Chats chats,
  ) async {
    late WidgetRef captured;
    tester.view
      ..devicePixelRatio = 1
      ..physicalSize = const Size(390, 844);
    addTearDown(tester.view.reset);
    await tester.pumpWidget(
      uxApp(
        Scaffold(
          body: Consumer(
            builder: (context, ref, _) {
              captured = ref;
              return TextButton(
                onPressed: () => forwardWithSheet(context, ref, const [
                  ForwardSource.message('m1'),
                ]),
                child: const Text('open'),
              );
            },
          ),
        ),
        theme: AppTheme.light(),
        overrides: uxOverrides(
          extra: [
            chatRepositoryProvider.overrideWithValue(chats),
            groupRepositoryProvider.overrideWithValue(
              FakeGroupRepository([
                listGroup('g-open'),
                listGroup('g-ro', canPost: false),
              ]),
            ),
            channelsEnabledProvider.overrideWithValue(false),
            currentUserIdProvider.overrideWithValue('me'),
            // Owner 2026-10-21 (inbox 25b): anyone in the app by name.
            peopleSuggestSearchProvider.overrideWithValue(
              (q) async => const [
                SuggestedPerson(id: 'u-c1', username: 'anna_p', name: 'Anna'),
                SuggestedPerson(
                  id: 's9',
                  username: 'anna_new',
                  name: 'Anna Stranger',
                ),
              ],
            ),
          ],
        ),
      ),
    );
    await tester.pump();
    return captured;
  }

  testWidgets('forwardMessages: one forwardBatch, oldest first, no outbox',
      (tester) async {
    final chats = _Chats();
    final ref = await pump(tester, chats);
    final text = await forwardMessages(
      ref,
      [
        _msg('late', MessageKind.text, minutes: 5),
        _msg('early', MessageKind.place, minutes: 1),
        _msg('gone', MessageKind.text, expiresAt: DateTime(2030)),
      ],
      const [ForwardTarget(ForwardTargetKind.conversation, 'c1')],
    );
    expect(text, _en.t('chat.forward.done'));
    expect(chats.plainSends, 0);
    expect(chats.batches, hasLength(1));
    expect(
      chats.batches.single.sources,
      const [ForwardSource.message('early'), ForwardSource.message('late')],
    );
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  });

  testWidgets('the sheet: sections, greyed rows, search, Send', (tester) async {
    final chats = _Chats();
    await pump(tester, chats);
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();

    expect(find.text(_en.t('chat.forward.chats')), findsOneWidget);
    expect(find.text(_en.t('chat.forward.groups')), findsOneWidget);
    expect(find.text(_en.t('chat.forward.cantPost')), findsNWidgets(2));
    // A closed chat and an admins-only group cannot be picked.
    await tester.tap(find.byKey(const ValueKey('forward-conversation-c2')));
    await tester.tap(find.byKey(const ValueKey('forward-group-g-ro')));
    await tester.pump();
    final send = find.byKey(const ValueKey('forward-send'));
    expect(tester.widget<AppButton>(send).onPressed, isNull);

    await tester.tap(find.byKey(const ValueKey('forward-conversation-c1')));
    await tester.tap(find.byKey(const ValueKey('forward-group-g-open')));
    await tester.pump();
    expect(find.text('${_en.t('chat.forward.send')} · 2'), findsOneWidget);

    // Search narrows the list.
    await tester.enterText(
      find.byKey(const ValueKey('forward-search')),
      'anna',
    );
    await tester.pump();
    expect(find.byKey(const ValueKey('forward-conversation-c2')), findsNothing);
    expect(
      find.byKey(const ValueKey('forward-conversation-c1')),
      findsOneWidget,
    );

    await tester.tap(send);
    await tester.pumpAndSettle();
    expect(chats.batches.single.to, const [
      ForwardTarget(ForwardTargetKind.conversation, 'c1'),
      ForwardTarget(ForwardTargetKind.group, 'g-open'),
    ]);
    expect(find.text(_en.t('chat.forward.done')), findsOneWidget);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  });

  testWidgets('a person found in the app: their chat opens, then forward',
      (tester) async {
    final chats = _Chats();
    await pump(tester, chats);
    await tester.tap(find.text('open'));
    await tester.pumpAndSettle();
    await tester.enterText(
      find.byKey(const ValueKey('forward-search')),
      'anna',
    );
    await tester.pump(peopleSuggestDebounce);
    await tester.pumpAndSettle();
    // Already a chat of mine: listed once, under «Chats».
    expect(find.byKey(const ValueKey('people-suggest-u-c1')), findsNothing);
    expect(find.text('Anna Stranger'), findsOneWidget);
    expect(find.textContaining('anna_new'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('people-suggest-s9')));
    await tester.pump();
    expect(find.text('${_en.t('chat.forward.send')} · 1'), findsOneWidget);
    await tester.tap(find.byKey(const ValueKey('forward-send')));
    await tester.pumpAndSettle();
    expect(chats.started, ['s9']);
    expect(chats.batches.single.to, const [
      ForwardTarget(ForwardTargetKind.conversation, 'dm-s9'),
    ]);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  });

  testWidgets('refused everywhere: the target error; partly: «not all»',
      (tester) async {
    final refused = _Chats(
      answer: (to) => [
        for (final t in to)
          ForwardResult(
            target: t,
            sourceId: 'm1',
            sent: false,
            code: ApiErrorCodes.unsupportedInTarget,
          ),
      ],
    );
    final ref = await pump(tester, refused);
    expect(
      await sendForward(
        ref,
        const [ForwardSource.message('m1')],
        const [ForwardTarget(ForwardTargetKind.group, 'g-open')],
      ),
      _en.t('error.api.UNSUPPORTED_IN_TARGET'),
    );
    final partly = _Chats(
      answer: (to) => [
        ForwardResult(target: to.first, sourceId: 'm1', sent: true),
        ForwardResult(target: to.last, sourceId: 'm1', sent: false),
      ],
    );
    final ref2 = await pump(tester, partly);
    expect(
      await sendForward(
        ref2,
        const [ForwardSource.message('m1')],
        const [
          ForwardTarget(ForwardTargetKind.conversation, 'c1'),
          ForwardTarget(ForwardTargetKind.group, 'g-open'),
        ],
      ),
      _en.t('chat.forward.partial'),
    );
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(minutes: 6));
  });
}
