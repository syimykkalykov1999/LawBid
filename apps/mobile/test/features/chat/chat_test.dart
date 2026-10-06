// ignore_for_file: lines_longer_than_80_chars
import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/notifications/presentation/notifications_view.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/team/team_routes.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';

const _offline =
    ApiException(code: ApiException.networkErrorCode, message: 'offline');

class _FakeChat implements ChatRepository {
  bool offline = false;
  ApiException? refuse;
  final sends = <String>[];

  Conversation conv() => Conversation(
        id: 'c1',
        caseId: 'case-1',
        caseTitle: 'Speeding ticket',
        status: ConversationStatus.preAcceptance,
        contactsUnlocked: false,
        counterpart: const Counterpart(isAttorney: false, verified: false),
        unreadCount: 0,
        updatedAt: DateTime(2026),
      );

  @override
  Future<Conversation> conversation(String id) async => conv();

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<ChatMessage> send(
    String id,
    String clientMessageId,
    String body,
  ) async {
    if (offline) throw _offline;
    final r = refuse;
    if (r != null) throw r;
    sends.add(clientMessageId);
    return ChatMessage(
      id: 'srv-${sends.length}',
      conversationId: id,
      senderId: 'me',
      kind: MessageKind.text,
      body: body,
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

ProviderContainer _container(_FakeChat chat) {
  final db = SocialLocalDatabase(NativeDatabase.memory());
  final c = ProviderContainer(
    overrides: [
      chatRepositoryProvider.overrideWithValue(chat),
      socialLocalDatabaseProvider.overrideWithValue(db),
      currentUserIdProvider.overrideWithValue('me'),
      realtimeClientProvider.overrideWithValue(null),
      networkInterfaceMonitorProvider.overrideWithValue(FakeNetworkMonitor()),
      reachabilityProbeProvider.overrideWithValue(FakeProbe().call),
    ],
  );
  addTearDown(() async {
    c.dispose();
    await db.close();
  });
  return c;
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 50));

void main() {
  test('offline message waits in the outbox, then goes once (§8.4)', () async {
    final chat = _FakeChat()..offline = true;
    final c = _container(chat);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();

    await c.read(chatThreadProvider('c1').notifier).send('Hello');
    await _settle();
    var s = c.read(chatThreadProvider('c1'));
    expect(s.outbox.single.delivery, DeliveryState.sending);
    expect(chat.sends, isEmpty);

    // Back online: drained once; a second drain does not resend.
    chat.offline = false;
    await c.read(outboxSenderProvider).drain();
    await c.read(outboxSenderProvider).drain();
    await _settle();
    s = c.read(chatThreadProvider('c1'));
    expect(chat.sends, hasLength(1));
    expect(s.outbox, isEmpty);
    expect(s.messages.single.body, 'Hello');
  });

  test('a definitive refusal marks the message "not sent" (no retry loop)',
      () async {
    final chat = _FakeChat()
      ..refuse = const ApiException(
        code: 'CONVERSATION_CLOSED',
        message: 'closed',
        statusCode: 409,
      );
    final c = _container(chat);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    await c.read(chatThreadProvider('c1').notifier).send('Hi');
    await _settle();
    await c.read(outboxSenderProvider).drain();
    await _settle();
    final s = c.read(chatThreadProvider('c1'));
    expect(s.outbox.single.delivery, DeliveryState.failed);
    expect(s.outbox.single.failedCode, 'CONVERSATION_CLOSED');
  });

  test('clientMessageId is a v4 UUID', () {
    final id = newClientMessageId();
    expect(
      RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
          .hasMatch(id),
      isTrue,
    );
  });

  test('notification taps open the right screen (§9.2)', () {
    expect(
      notificationRoute(
        type: 'new_message',
        payload: {'conversationId': 'c1'},
        attorney: false,
      ),
      '/chat/c1',
    );
    expect(
      notificationRoute(
        type: 'bid_received',
        payload: {'bidId': 'b1'},
        attorney: false,
      ),
      '/bid/b1',
    );
    expect(
      notificationRoute(
        type: 'post_like',
        payload: {'postId': 'p1'},
        attorney: true,
      ),
      '/post/p1',
    );
    expect(
      notificationRoute(
        type: 'case_closed',
        payload: {'caseId': 'k1'},
        attorney: false,
      ),
      '/mine/case/k1',
    );
  });

  test('audit 2026-10-04: notification routes', () {
    String? r(String type, Map<String, Object?> p, {bool attorney = true}) =>
        notificationRoute(type: type, payload: p, attorney: attorney);
    expect(r('case_updated', {'caseId': 'k1'}), AppRoutes.caseDetail('k1'));
    expect(r('case_archived', {'caseId': 'k1'}), AppRoutes.caseDetail('k1'));
    expect(r('case_closed', {'caseId': 'k1'}), AppRoutes.workCase('k1'));
    expect(r('case_disputed', {'caseId': 'k1'}), AppRoutes.workCase('k1'));
    expect(
      r('case_disputed', {'caseId': 'k1'}, attorney: false),
      AppRoutes.myCase('k1'),
    );
    expect(
      r('bid_accepted', {'caseId': 'k1', 'bidId': 'b1'}),
      AppRoutes.workCase('k1'),
    );
    expect(r('bid_accepted', {'bidId': 'b1'}), AppRoutes.bid('b1'));
    // Owner 2026-10-06: an accepted bid opens the chat with that person.
    expect(
      r(
        'bid_accepted',
        {'caseId': 'k1', 'bidId': 'b1', 'conversationId': 'c9'},
      ),
      '/chat/c9',
    );
    expect(
      r(
        'offer_accepted',
        {'caseId': 'k1', 'bidId': 'b1', 'conversationId': 'c9'},
        attorney: false,
      ),
      '/chat/c9',
    );
    expect(
      r('offer_accepted', {'caseId': 'k1', 'bidId': 'b1'}, attorney: false),
      AppRoutes.bid('b1'),
    );
    expect(r('assistant_joined', {}), TeamRoutes.team);
    // Push data carries strings.
    expect(
      r(
        'review_received',
        {'reply': 'true', 'actorUsername': 'anna'},
        attorney: false,
      ),
      AppRoutes.lawyer('anna'),
    );
    expect(
      r('review_received', {'reply': true}, attorney: false),
      AppRoutes.profile,
    );
  });

  test('audit 2026-10-04: a block applies except in an active case chat', () {
    Conversation c({
      String? caseId = 'k1',
      bool unlocked = true,
      ConversationStatus status = ConversationStatus.active,
    }) =>
        Conversation(
          id: 'c1',
          caseId: caseId,
          caseTitle: null,
          status: status,
          contactsUnlocked: unlocked,
          blocked: true,
          counterpart: const Counterpart(isAttorney: false, verified: false),
          unreadCount: 0,
          updatedAt: DateTime(2026),
        );
    expect(c().blockedHere, isFalse);
    expect(c(unlocked: false).blockedHere, isTrue);
    expect(c(status: ConversationStatus.closed).blockedHere, isTrue);
    expect(c(caseId: null).blockedHere, isTrue);
  });
}
