// ignore_for_file: lines_longer_than_80_chars
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/chat/presentation/chat_album.dart';
import 'package:lawbid/features/chat/presentation/chat_bubble_parts.dart';

import '../../helpers/ux_harness.dart';

/// Owner 2026-10-22 (WhatsApp / Telegram): one picture per theme with every
/// kind of bubble built from the shared parts - text with the time on its
/// last line, photo with the time pill, photo + caption, album grid, file
/// card, sticker chip, the tick states and the date chip. Voice notes have
/// their own golden (voice_bubble_golden_test.dart).
Future<Uint8List> _pic(int w, int h, Color a, Color b) async {
  final rec = ui.PictureRecorder();
  final rect = ui.Rect.fromLTWH(0, 0, w.toDouble(), h.toDouble());
  ui.Canvas(rec).drawRect(
    rect,
    ui.Paint()
      ..shader = ui.Gradient.linear(rect.topLeft, rect.bottomRight, [a, b]),
  );
  final image = await rec.endRecording().toImage(w, h);
  return (await image.toByteData(format: ui.ImageByteFormat.png))!
      .buffer
      .asUint8List();
}

ChatMessage _photo(String id, Uint8List bytes, {String body = ''}) =>
    ChatMessage(
      id: id,
      conversationId: 'c',
      kind: MessageKind.attachment,
      body: body,
      createdAt: DateTime(2026, 10, 22, 12, 30),
      senderId: 'me',
      attachment: ChatAttachment(
        fileId: id,
        name: '$id.jpg',
        isImage: true,
        mime: 'image/jpeg',
        width: 240,
        height: 160,
        localBytes: bytes,
      ),
    );

ChatMessage _file() => ChatMessage(
      id: 'f',
      conversationId: 'c',
      kind: MessageKind.attachment,
      body: '',
      createdAt: DateTime(2026, 10, 22, 12, 31),
      senderId: 'u2',
      attachment: const ChatAttachment(
        fileId: 'f',
        name: 'Lease agreement.pdf',
        isImage: false,
        mime: 'application/pdf',
        sizeBytes: 482000,
      ),
    );

class _Row extends StatelessWidget {
  const _Row({required this.mine, required this.child});

  final bool mine;
  final Widget child;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
        child: Align(
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: child,
        ),
      );
}

Widget _meta(BuildContext context, {required bool mine, bool seen = false}) {
  final chat = ChatColors.of(context);
  final type = Theme.of(context).extension<AppTypographyTokens>()!;
  final c = mine ? chat.mineMeta : chat.theirsMeta;
  return Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Text('12:30', style: type.caption.copyWith(color: c)),
      if (mine) ...[
        const SizedBox(width: 4),
        ChatTicks(
          delivery: DeliveryState.sent,
          seen: seen,
          delivered: true,
          color: c,
        ),
      ],
    ],
  );
}

Widget _text(
  BuildContext context,
  String text, {
  required bool mine,
  bool seen = false,
}) {
  final chat = ChatColors.of(context);
  final type = Theme.of(context).extension<AppTypographyTokens>()!;
  return ChatBubbleShell(
    mine: mine,
    child: ChatTextWithMeta(
      spans: [TextSpan(text: text)],
      style: type.body.copyWith(
        color: mine ? chat.onMine : chat.onTheirs,
        height: 1.35,
      ),
      meta: _meta(context, mine: mine, seen: seen),
      metaWidth: 64,
    ),
  );
}

Widget _showcase(
  BuildContext context,
  Uint8List a,
  Uint8List b,
  Uint8List c,
  Uint8List d,
) {
  final chat = ChatColors.of(context);
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  return Scaffold(
    backgroundColor: chat.wallpaper,
    body: ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [
        const ChatDateChip(label: 'Today'),
        _Row(
          mine: false,
          child: _text(context, 'Hello! Can you sign today?', mine: false),
        ),
        _Row(mine: true, child: _text(context, 'Yes', mine: true, seen: true)),
        _Row(
          mine: true,
          child: _text(
            context,
            'I will bring the signed lease and the receipt for the deposit this afternoon, around three.',
            mine: true,
          ),
        ),
        // A photo: the time on a translucent pill in its corner.
        _Row(
          mine: true,
          child: ChatBubbleShell(
            mine: true,
            media: true,
            child: Stack(
              children: [
                AttachmentMessageBody(message: _photo('p1', a), mine: true),
                const PositionedDirectional(
                  end: 6,
                  bottom: 6,
                  child: ChatMediaMeta(
                    time: '12:30',
                    ticks: ChatTicks(
                      delivery: DeliveryState.sent,
                      seen: true,
                      delivered: true,
                      color: ChatColors.onMediaScrim,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        // A photo with a caption under it, inside the same bubble.
        _Row(
          mine: false,
          child: ChatBubbleShell(
            mine: false,
            framed: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                AttachmentMessageBody(
                  message: _photo('p2', b, body: 'Page two'),
                  mine: false,
                  captionPadding: const EdgeInsets.symmetric(horizontal: 9),
                ),
                SizedBox(
                  width: 240,
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 9),
                    child: Align(
                      alignment: AlignmentDirectional.centerEnd,
                      child: _meta(context, mine: false),
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        // An album: a tight grid, the pill on its corner.
        _Row(
          mine: true,
          child: ChatBubbleShell(
            mine: true,
            media: true,
            child: Stack(
              children: [
                ChatAttachmentGroupBody(
                  messages: [
                    _photo('g1', a),
                    _photo('g2', b),
                    _photo('g3', c),
                    _photo('g4', d),
                  ],
                  mine: true,
                ),
                const PositionedDirectional(
                  end: 6,
                  bottom: 6,
                  child: ChatMediaMeta(
                    time: '12:31',
                    ticks: ChatTicks(
                      delivery: DeliveryState.sent,
                      seen: false,
                      delivered: false,
                      color: ChatColors.onMediaScrim,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        // A file card.
        _Row(
          mine: false,
          child: ChatBubbleShell(
            mine: false,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                AttachmentMessageBody(message: _file(), mine: false),
                _meta(context, mine: false),
              ],
            ),
          ),
        ),
        // A sticker: no bubble, a chip with the time.
        _Row(
          mine: true,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.end,
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 120,
                height: 120,
                decoration: BoxDecoration(
                  color: colors.goldTint,
                  borderRadius: BorderRadius.circular(24),
                ),
                child: Center(
                  child: AppIcon(
                    AppIcons.balanceRounded,
                    size: 64,
                    color: colors.iconTint,
                  ),
                ),
              ),
              ChatStickerMeta(
                time: '12:32',
                ticks: ChatTicks(
                  delivery: DeliveryState.sent,
                  seen: true,
                  delivered: true,
                  color: colors.textSecondary,
                ),
              ),
            ],
          ),
        ),
        // The tick states, side by side.
        _Row(
          mine: true,
          child: ChatBubbleShell(
            mine: true,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                for (final (d, seen, del) in [
                  (DeliveryState.sending, false, false),
                  (DeliveryState.sent, false, false),
                  (DeliveryState.sent, false, true),
                  (DeliveryState.sent, true, true),
                  (DeliveryState.failed, false, false),
                ])
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: ChatTicks(
                      delivery: d,
                      seen: seen,
                      delivered: del,
                      color: chat.mineMeta,
                    ),
                  ),
              ],
            ),
          ),
        ),
      ],
    ),
  );
}

void main() {
  for (final id in AppThemeId.values) {
    testGoldens('chat bubbles - ${id.name}', (tester) async {
      final pics = (await tester.runAsync(
        () => Future.wait([
          _pic(240, 160, const Color(0xFF2D6CDF), const Color(0xFF9BC1FF)),
          _pic(240, 160, const Color(0xFFD9822B), const Color(0xFFFFD79B)),
          _pic(240, 160, const Color(0xFF2E9E6B), const Color(0xFFA8E6C6)),
          _pic(240, 160, const Color(0xFF8E44AD), const Color(0xFFD7B3E8)),
        ]),
      ))!;
      await tester.pumpWidgetBuilder(
        Builder(
          builder: (context) =>
              _showcase(context, pics[0], pics[1], pics[2], pics[3]),
        ),
        wrapper: (child) => uxApp(
          child,
          theme: AppTheme.of(id),
          overrides: uxOverrides(),
          size: const Size(390, 1250),
          disableAnimations: true,
        ),
        surfaceSize: const Size(390, 1250),
      );
      await tester.pump(const Duration(milliseconds: 300));
      await screenMatchesGolden(tester, 'chat_bubbles_${id.name}');
    });
  }
}
