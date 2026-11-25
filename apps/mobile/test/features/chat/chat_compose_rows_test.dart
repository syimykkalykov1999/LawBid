import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/chat/application/chat_text_drafts.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/chat/presentation/message_actions.dart';
import 'package:lawbid/features/chat/presentation/voice_hold.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:material_ui/material_ui.dart';

import 'contact_info_test.dart';

/// An edit the server answers only when [gate] completes.
class _SlowEditChat extends FakeContactChat {
  _SlowEditChat() : super(makeConv());

  final gate = Completer<void>();

  @override
  Future<ChatMessage> editMessage(
    String id,
    String messageId,
    String body,
  ) async {
    await gate.future;
    return textMessages
        .firstWhere((m) => m.id == messageId)
        .copyWith(body: body, editedAt: DateTime.now());
  }
}

/// Owner rows 184 and 189 (2026-11-17) on the real chat screen, and the
/// composer half of row 188.
List<ChatMessage> _history() => [
      for (var i = 3; i >= 0; i--)
        ChatMessage(
          id: 'm$i',
          conversationId: 'c1',
          kind: MessageKind.text,
          body: 'message $i',
          senderId: i.isEven ? 'u2' : 'me',
          createdAt: DateTime.now().subtract(Duration(minutes: 10 - i)),
        ),
    ];

/// The chat opened on top of a list screen, as from the chats tab.
Widget _app(FakeContactChat chat, {List<Override> extra = const []}) =>
    contactTestApp(
      chat,
      Scaffold(
        body: Builder(
          builder: (context) => TextButton(
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute<void>(
                builder: (_) => const ConversationScreen(conversationId: 'c1'),
              ),
            ),
            child: const Text('open chat'),
          ),
        ),
      ),
      pushed: [],
      extra: extra,
    );

Future<ProviderContainer> _openChat(
  WidgetTester tester, {
  FakeContactChat? with_,
  List<Override> extra = const [],
}) async {
  final chat = (with_ ?? FakeContactChat(makeConv()))
    ..textMessages.addAll(_history());
  await pumpContact(tester, _app(chat, extra: extra));
  await tester.tap(find.text('open chat'));
  await tester.pumpAndSettle();
  expect(find.byType(ConversationScreen), findsOneWidget);
  return ProviderScope.containerOf(
    tester.element(find.byType(ConversationScreen)),
  );
}

Future<void> _done(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 2));
}

ChatMessage _mine() => _history().firstWhere((m) => m.senderId == 'me');

EditableText _field(WidgetTester tester) =>
    tester.widget<EditableText>(find.byType(EditableText).last);

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
  });

  testWidgets('row 184: system back in selection mode clears the selection', (
    tester,
  ) async {
    final c = await _openChat(tester);
    c.read(chatMsgSelectionProvider('c1').notifier).start('m1');
    await tester.pumpAndSettle();
    expect(c.read(chatMsgSelectionProvider('c1')), {'m1'});

    // Android back key / gesture, the browser's back (all are popRoute).
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(
      find.byType(ConversationScreen),
      findsOneWidget,
      reason: 'the chat stays open',
    );
    expect(c.read(chatMsgSelectionProvider('c1')), isEmpty);

    // Without a selection back closes the chat as before.
    await tester.binding.handlePopRoute();
    await tester.pumpAndSettle();
    expect(find.byType(ConversationScreen), findsNothing);
    await _done(tester);
  });

  testWidgets(
      'row 189: «Изменить» puts the typed draft aside and brings it '
      'back when the edit is closed', (tester) async {
    final c = await _openChat(tester);
    await tester.enterText(find.byType(EditableText).last, 'half a thought');
    await tester.pump(const Duration(milliseconds: 50));
    expect(c.read(chatTextDraftsProvider)['c1'], 'half a thought');

    final mine = _mine();
    c.read(chatComposeProvider('c1').notifier).edit(mine);
    await tester.pumpAndSettle();
    expect(_field(tester).controller.text, mine.body);
    expect(
      c.read(chatTextDraftsProvider)['c1'],
      'half a thought',
      reason: 'the chats list keeps showing the real draft',
    );

    // ✕ on the edit bar.
    c.read(chatComposeProvider('c1').notifier).clear();
    await tester.pumpAndSettle();
    expect(_field(tester).controller.text, 'half a thought');
    expect(c.read(chatTextDraftsProvider)['c1'], 'half a thought');
    await _done(tester);
  });

  // ROUND1 25.11 row 14 (as the group): a slow save of one edit must not
  // close the edit of another message picked meanwhile (its text went).
  testWidgets('a slow edit save leaves the next edit open', (tester) async {
    final chat = _SlowEditChat();
    final c = await _openChat(tester, with_: chat);
    final compose = c.read(chatComposeProvider('c1').notifier);
    final mine = _history().where((m) => m.senderId == 'me').toList();
    compose.edit(mine[0]);
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(EditableText).last, 'fixed text');
    await tester.pump();
    await tester.tap(
      find.bySemanticsLabel(const StaticTranslatorRu().t('chat.send')),
    );
    await tester.pump();

    compose.edit(mine[1]);
    await tester.pumpAndSettle();
    expect(_field(tester).controller.text, mine[1].body);

    chat.gate.complete();
    await tester.pumpAndSettle();
    expect(c.read(chatComposeProvider('c1')).editing?.id, mine[1].id);
    expect(_field(tester).controller.text, mine[1].body);
    await _done(tester);
  });

  // ROUND1 25.11 row 15 (as the group's _sendVoice): a note the phone could
  // not put in the queue (here the recording is gone) tells why instead of
  // vanishing with an unhandled error.
  testWidgets('a voice note that cannot be queued says so', (tester) async {
    // uxOverrides already gives the chat the upload queue (a temp folder).
    await _openChat(tester);
    final composer = tester.state<ConsumerState>(
      find.byWidgetPredicate((w) => '${w.runtimeType}' == '_Composer'),
    ) as VoiceHoldRecorder;
    await tester.runAsync(
      () => composer.sendVoiceRecording(
        (path: '/no/such/dir/note.m4a', durationMs: 1200, waveform: const [3]),
      ),
    );
    await tester.pump();
    expect(
      find.text(const StaticTranslatorRu().t('error.default.message')),
      findsOneWidget,
    );
    await _done(tester);
  });

  test('row 188: a non-text send takes the quote and closes «Ответить»', () {
    final c = ProviderContainer(
      overrides: [currentUserIdProvider.overrideWithValue('me')],
    );
    addTearDown(c.dispose);
    final sub = c.listen(chatComposeProvider('c1'), (_, __) {});
    final quoted = _history().first;
    final n = c.read(chatComposeProvider('c1').notifier)..reply(quoted);
    expect(n.takeReply(), quoted.id);
    expect(c.read(chatComposeProvider('c1')).replyTo, isNull);
    expect(n.takeReply(), isNull, reason: 'taken once');
    sub.close();
  });

  test(
    'row 188: the quote is kept in the draft when the chat is left',
    () async {
      final c = ProviderContainer(
        overrides: [currentUserIdProvider.overrideWithValue('me')],
      );
      addTearDown(c.dispose);
      final quoted = _history().first;
      var sub = c.listen(chatComposeProvider('c1'), (_, __) {});
      c.read(chatComposeProvider('c1').notifier).reply(quoted);
      sub.close(); // the chat closes: the composer is disposed
      await Future<void>.delayed(Duration.zero);

      sub = c.listen(chatComposeProvider('c1'), (_, __) {});
      expect(c.read(chatComposeProvider('c1')).replyTo?.id, quoted.id);

      // An edit hides the quote, closing the edit brings it back.
      final mine = _mine();
      c.read(chatComposeProvider('c1').notifier).edit(mine);
      expect(c.read(chatComposeProvider('c1')).replyTo, isNull);
      c.read(chatComposeProvider('c1').notifier).clear();
      expect(c.read(chatComposeProvider('c1')).replyTo?.id, quoted.id);

      // ✕ on the reply bar ends it for good.
      c.read(chatComposeProvider('c1').notifier).clear();
      sub.close();
      await Future<void>.delayed(Duration.zero);
      sub = c.listen(chatComposeProvider('c1'), (_, __) {});
      expect(c.read(chatComposeProvider('c1')).replyTo, isNull);
      sub.close();
    },
  );
}
