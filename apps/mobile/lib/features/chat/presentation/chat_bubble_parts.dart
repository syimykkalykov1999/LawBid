import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// Owner 2026-10-22 (WhatsApp / Telegram research): the small parts every
/// chat bubble is made of, so each message type looks the same in every
/// theme and on the web. Colours only from `ChatColors` / theme tokens.
///
/// What the two apps do inside a bubble:
/// * WhatsApp: 8-10 dp side padding, 12 dp corners (the tail corner 0),
///   the time sits at the end of the LAST text line (it wraps to its own
///   line only when the line is full); a photo fills the bubble with a
///   2-3 dp inset and the time on a translucent dark pill in its corner;
///   a caption goes under the photo inside the same bubble.
/// * Telegram: 16 dp corners (the tail 4), the same inline time, the media
///   pill, stickers without a bubble (time on a chip), albums as a tight
///   grid with 1-2 dp gaps.

/// Sent / delivered / seen marks (one grey tick, two grey, two blue),
/// a clock while sending, an alert when failed.
class ChatTicks extends StatelessWidget {
  const ChatTicks({
    required this.delivery,
    required this.seen,
    required this.delivered,
    required this.color,
    this.size = 15,
    super.key,
  });

  final DeliveryState delivery;
  final bool seen;
  final bool delivered;

  /// The "plain" colour (sent / delivered); seen is `ChatColors.tickRead`.
  final Color color;
  final double size;

  /// The mark a state shows (kept testable on its own).
  static IconData iconFor(
    DeliveryState d, {
    bool seen = false,
    bool delivered = false,
  }) =>
      switch (d) {
        DeliveryState.sending => AppIcons.scheduleRounded,
        DeliveryState.failed => AppIcons.errorOutlineRounded,
        DeliveryState.sent =>
          seen || delivered ? AppIcons.doneAllRounded : AppIcons.doneRounded,
      };

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final chat = ChatColors.of(context);
    final failed = delivery == DeliveryState.failed;
    return AppIcon(
      iconFor(delivery, seen: seen, delivered: delivered),
      size: size,
      color: failed
          ? colors.danger
          : seen && delivery == DeliveryState.sent
              ? chat.tickRead
              : color,
    );
  }
}

/// The time (and ticks) on a translucent dark pill laid over the corner of
/// a photo / video / album. Wrap in a `Positioned`.
class ChatMediaMeta extends StatelessWidget {
  const ChatMediaMeta({required this.time, this.ticks, super.key});

  final String time;
  final Widget? ticks;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      key: const ValueKey('chat-media-meta'),
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: ChatColors.mediaScrim,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            time,
            style: type.caption.copyWith(
              color: ChatColors.onMediaScrim,
              height: 1.2,
            ),
          ),
          if (ticks != null) ...[const SizedBox(width: 3), ticks!],
        ],
      ),
    );
  }
}

/// The time chip under a sticker (no bubble around a sticker).
class ChatStickerMeta extends StatelessWidget {
  const ChatStickerMeta({required this.time, this.ticks, super.key});

  final String time;
  final Widget? ticks;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: colors.surface.withValues(alpha: 0.85),
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            time,
            style: type.caption.copyWith(
              color: colors.textSecondary,
            ),
          ),
          if (ticks != null) ...[const SizedBox(width: 4), ticks!],
        ],
      ),
    );
  }
}

/// A text bubble's body with the time on the end of its last line
/// (WhatsApp): the text is measured, and when the last line leaves room for
/// [meta] (`metaWidth` wide) it sits there on the same line; otherwise the
/// bubble grows by one meta row under the text. The text stays a plain
/// `Text`, so it is still found / read as the message.
class ChatTextWithMeta extends StatelessWidget {
  const ChatTextWithMeta({
    required this.spans,
    required this.style,
    required this.meta,
    required this.metaWidth,
    super.key,
  });

  final List<InlineSpan> spans;
  final TextStyle style;
  final Widget meta;
  final double metaWidth;

  /// Height of the meta row when it needs a line of its own.
  static const double metaHeight = 16;
  static const double gap = 8;

  @override
  Widget build(BuildContext context) {
    final span = TextSpan(children: spans, style: style);
    return LayoutBuilder(
      builder: (context, c) {
        final max =
            c.maxWidth.isFinite ? c.maxWidth : MediaQuery.sizeOf(context).width;
        final tp = TextPainter(
          text: span,
          textDirection: Directionality.of(context),
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: max);
        final lines = tp.computeLineMetrics();
        final lastW = lines.isEmpty ? 0.0 : lines.last.width;
        final textW = tp.width;
        final textH = tp.height;
        tp.dispose();
        final fits = lastW + gap + metaWidth <= max;
        final width = fits
            ? (textW > lastW + gap + metaWidth
                ? textW
                : lastW + gap + metaWidth)
            : (textW > metaWidth ? textW : metaWidth);
        final height = fits ? textH : textH + metaHeight;
        return SizedBox(
          width: width,
          height: height,
          child: Stack(
            children: [
              // Both sides: a positioned child with one side is unbounded
              // in width and would not wrap.
              PositionedDirectional(
                start: 0,
                end: 0,
                top: 0,
                child: Text.rich(span),
              ),
              PositionedDirectional(end: 0, bottom: 0, child: meta),
            ],
          ),
        );
      },
    );
  }
}

/// How wide a bubble's meta row is: [labels] (time, "edited") in
/// [style] plus [icons] marks of [iconSize] and the gaps between them.
double chatMetaWidth(
  BuildContext context, {
  required List<String> labels,
  required TextStyle? style,
  int icons = 0,
  double iconSize = 15,
}) {
  var w = 0.0;
  for (final l in labels) {
    final p = TextPainter(
      text: TextSpan(text: l, style: style),
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
      maxLines: 1,
    )..layout();
    w += p.width + 4;
    p.dispose();
  }
  return w + icons * (iconSize + 4);
}

/// The bubble's frame: colour, tail corner, thin padding.
class ChatBubbleShell extends StatelessWidget {
  const ChatBubbleShell({
    required this.mine,
    required this.child,
    this.media = false,
    this.framed = false,
    this.maxWidth,
    super.key,
  });

  final bool mine;

  /// A caption-less photo / video: a 3 dp frame.
  final bool media;

  /// A photo with a caption: 3 dp frame at the top and sides.
  final bool framed;
  final double? maxWidth;
  final Widget child;

  /// Thin WhatsApp-like padding.
  static const textPadding = EdgeInsets.fromLTRB(10, 6, 10, 4);
  static const mediaInset = 3.0;

  @override
  Widget build(BuildContext context) {
    final chat = ChatColors.of(context);
    return Container(
      constraints: BoxConstraints(
        maxWidth: maxWidth ?? MediaQuery.sizeOf(context).width * 0.78,
      ),
      padding: media
          ? const EdgeInsets.all(mediaInset)
          : framed
              ? const EdgeInsets.fromLTRB(
                  mediaInset,
                  mediaInset,
                  mediaInset,
                  AppSpacing.xs,
                )
              : textPadding,
      decoration: BoxDecoration(
        color: mine ? chat.mine : chat.theirs,
        borderRadius: BorderRadiusDirectional.only(
          topStart: const Radius.circular(16),
          topEnd: const Radius.circular(16),
          bottomStart: Radius.circular(mine ? 16 : 4),
          bottomEnd: Radius.circular(mine ? 4 : 16),
        ),
        border: mine ? null : Border.all(color: chat.theirsBorder),
      ),
      child: child,
    );
  }
}

/// The day on a small pill in the middle (WhatsApp / Telegram).
class ChatDateChip extends StatelessWidget {
  const ChatDateChip({required this.label, this.padded = true, super.key});

  final String label;

  /// Vertical room around it in the list; off for the sticky overlay.
  final bool padded;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      decoration: BoxDecoration(
        color: chat.theirs.withValues(alpha: colors.isGlass ? 1 : 0.92),
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: chat.theirsBorder),
      ),
      child: Text(
        label,
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: type.caption.copyWith(
          color: colors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
    return Padding(
      padding: EdgeInsets.symmetric(vertical: padded ? AppSpacing.md : 0),
      child: Center(child: chip),
    );
  }
}
