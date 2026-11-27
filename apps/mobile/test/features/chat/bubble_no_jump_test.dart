import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_message_bubble.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:material_ui/material_ui.dart';

import '../../helpers/ux_harness.dart';
import '../groups/fake_group_repository.dart';

Uint8List _png(int w, int h) =>
    Uint8List.fromList(img.encodePng(img.Image(width: w, height: h)));

const _url = 'https://media.lawbid.test/chat_attachment/me/f1'
    '?Expires=4102444800&Signature=s&Key-Pair-Id=k';

/// Owner 27.11 («скачки везде»): a message keeps its size from the first
/// frame — the local copy, the server's answer (sent while its antivirus
/// check still runs, so without width / height) and the checked copy.
void main() {
  setUpAll(initializeDateFormatting);
  setUp(SentMediaShapes.reset);

  Future<Size> sizeOf(WidgetTester t, Widget child) async {
    t.view.physicalSize = const Size(390, 844);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await t.pumpWidget(
      uxApp(
        Scaffold(
          body: Align(
            alignment: Alignment.topRight,
            child: KeyedSubtree(key: const ValueKey('probe'), child: child),
          ),
        ),
        theme: AppTheme.light(),
        disableAnimations: true,
        overrides: uxOverrides(
          extra: [currentUserIdProvider.overrideWithValue('me')],
        ),
      ),
    );
    await t.pump();
    // The bubble itself (its decorated, width-capped box) when there is
    // one; else the whole probe.
    final bubble = find.descendant(
      of: find.byKey(const ValueKey('probe')),
      matching: find.byWidgetPredicate(
        (w) =>
            w is Container &&
            w.constraints != null &&
            w.decoration is BoxDecoration &&
            (w.decoration! as BoxDecoration).borderRadius != null,
      ),
    );
    final size = t.getSize(
      bubble.evaluate().isEmpty
          ? find.byKey(const ValueKey('probe'))
          : bubble.first,
    );
    // Drift / image timers of the bubble end before the next pump.
    await t.pumpWidget(const SizedBox());
    await t.pump(const Duration(seconds: 1));
    return size;
  }

  group('1:1 photo: local → answer → checked', () {
    ChatMessage msg(ChatAttachment a, {DeliveryState? d}) => ChatMessage(
          id: 'm1',
          conversationId: 'c1',
          senderId: 'me',
          kind: MessageKind.attachment,
          body: '',
          createdAt: DateTime(2026, 11, 27, 22, 29),
          delivery: d ?? DeliveryState.sent,
          attachment: a,
        );

    testWidgets('the answer without width / height keeps the picked shape', (
      t,
    ) async {
      final local = ChatAttachment(
        fileId: '',
        name: 'IMG_1.jpg',
        isImage: true,
        mime: 'image/jpeg',
        localBytes: _png(30, 40),
        width: 1200,
        height: 1600,
      );
      const answer = ChatAttachment(
        fileId: 'f1',
        name: 'IMG_1.jpg',
        isImage: true,
        mime: 'image/jpeg',
        url: _url,
      );
      const checked = ChatAttachment(
        fileId: 'f1',
        name: 'IMG_1.jpg',
        isImage: true,
        mime: 'image/jpeg',
        url: _url,
        width: 1200,
        height: 1600,
      );
      final a = await sizeOf(
        t,
        AttachmentMessageBody(
          message: msg(local, d: DeliveryState.sending),
          mine: true,
        ),
      );
      // The cause: the server's answer alone draws a 4:3 box.
      final raw = await sizeOf(
        t,
        AttachmentMessageBody(message: msg(answer), mine: true),
      );
      expect(raw, isNot(a), reason: 'the answer alone has no shape');

      SentMediaShapes.note('f1', 1200, 1600);
      final b = await sizeOf(
        t,
        AttachmentMessageBody(message: msg(answer.withSentShape()), mine: true),
      );
      final c = await sizeOf(
        t,
        AttachmentMessageBody(message: msg(checked), mine: true),
      );
      expect(b, a);
      expect(c, a);
    });
  });

  group('group bubbles: pending → delivered', () {
    Widget delivered(api.GroupMessageDto m) => GroupMessageBubble(
          message: m,
          groupId: 'g1',
          showName: false,
          showAvatar: false,
          canClose: false,
          highlighted: false,
          onMenu: () {},
          onPollChanged: (_) {},
        );

    api.GroupMessageDto photo({int? w, int? h}) => message(
          'm2',
          body: '',
          mine: true,
          type: api.GroupMessageDtoType.attachment,
          attachment: api.ChatAttachmentDto(
            fileId: 'f2',
            name: 'IMG_2.jpg',
            isImage: true,
            mime: 'image/jpeg',
            url: _url,
            width: w,
            height: h,
          ),
        );

    testWidgets('a photo keeps its size (frame, shape)', (t) async {
      final pending = await sizeOf(
        t,
        GroupPendingBubble(
          groupId: 'g1',
          pending: PendingGroupMessage(
            clientMessageId: 'c1',
            body: '',
            fileName: 'IMG_2.jpg',
            attachment: ChatAttachment(
              fileId: '',
              name: 'IMG_2.jpg',
              isImage: true,
              mime: 'image/jpeg',
              localBytes: _png(30, 40),
              width: 1200,
              height: 1600,
              progress: 0.5,
            ),
          ),
          onRetry: () {},
          onDiscard: () {},
        ),
      );
      SentMediaShapes.note('f2', 1200, 1600);
      final answer = await sizeOf(t, delivered(photo()));
      final checked = await sizeOf(t, delivered(photo(w: 1200, h: 1600)));
      expect(answer, checked);
      expect(pending, checked);
    });

    testWidgets('a text keeps its height (the clock sits in the time slot)', (
      t,
    ) async {
      final pending = await sizeOf(
        t,
        GroupPendingBubble(
          groupId: 'g1',
          pending: const PendingGroupMessage(clientMessageId: 'c3', body: 'Hi'),
          onRetry: () {},
          onDiscard: () {},
        ),
      );
      final sent = await sizeOf(
        t,
        delivered(message('m3', body: 'Hi', mine: true)),
      );
      expect(pending.height, sent.height);
    });
  });

  test('comments: the server copy keeps the row of its pending copy', () {
    commentRowKeys.settled('pending:k1', 'c-live-1');
    expect(commentRowKeys.keyOf('c-live-1'), 'pending:k1');
    expect(commentRowKeys.keyOf('c-other'), 'c-other');
  });
}
