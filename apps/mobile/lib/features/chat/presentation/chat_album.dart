import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_photos.dart'
    show openCaseDocument;
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/domain/message_groups.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart'
    show docLook, fileSizeLabel;
import 'package:lawbid/features/chat/presentation/chat_video.dart';

/// Owner 2026-10-19 (Telegram): the most a photo / album takes in a chat —
/// about two thirds of the chat's width (never wider than 400 on a big web
/// window) and about 320 tall.
({double maxWidth, double maxHeight}) chatMediaLimits(BuildContext context) {
  final s = MediaQuery.sizeOf(context);
  return (
    maxWidth: math.min(s.width * 0.68, 400),
    maxHeight: math.min(320, math.max(200, s.height * 0.45)),
  );
}

/// The width / height of [a] when the server knows it.
double? chatAspectOf(ChatAttachment a) =>
    (a.width != null && a.height != null && a.width! > 0 && a.height! > 0)
        ? a.width! / a.height!
        : null;

/// The box of a single photo / video: its own shape inside the limits, never
/// bigger than the media itself (WhatsApp / Telegram: a small picture is not
/// stretched); a very tall or very wide one is cover-cropped instead of
/// becoming a strip. Drawn from the server's width / height before the
/// bytes arrive, so the bubble never jumps.
Size chatPhotoBox(
  double? aspect, {
  required double maxWidth,
  required double maxHeight,
  Size? original,
}) {
  final r = aspect ?? 4 / 3;
  var mw = maxWidth;
  var mh = maxHeight;
  if (original != null && original.width > 0 && original.height > 0) {
    mw = math.min(mw, math.max(original.width, kChatMediaMinSide));
    mh = math.min(mh, math.max(original.height, kChatMediaMinSide));
  }
  var w = mw;
  var h = w / r;
  if (h > mh) {
    h = mh;
    w = math.max(h * r, mw * 0.5);
  }
  return Size(w, math.max(h, mw * 0.4));
}

/// The smallest side a tiny picture is drawn at (dp).
const kChatMediaMinSide = 96.0;

/// The bubble box of the media [a] (photo or video) in this chat.
Size chatMediaBox(BuildContext context, ChatAttachment a) {
  final limits = chatMediaLimits(context);
  return chatPhotoBox(
    chatAspectOf(a) ?? (a.isVideo ? 3 / 4 : null),
    maxWidth: limits.maxWidth,
    maxHeight: limits.maxHeight,
    original: a.width != null && a.height != null
        ? Size(a.width!.toDouble(), a.height!.toDouble())
        : null,
  );
}

/// The cells of an album of [count] items, in units of the album's width
/// (Telegram's layouts: 2 side by side, 3 = one big + two, 4 = 2×2, more =
/// rows of 2 and 3). [firstAspect] picks big-left (portrait) or big-top.
List<Rect> chatAlbumLayout(int count, {double? firstAspect, double? avg}) {
  if (count <= 1) return const [Rect.fromLTWH(0, 0, 1, 0.75)];
  if (count == 2) {
    final h = 0.5 / (avg ?? 1).clamp(0.75, 1.33);
    return [Rect.fromLTWH(0, 0, 0.5, h), Rect.fromLTWH(0.5, 0, 0.5, h)];
  }
  if (count == 3) {
    if ((firstAspect ?? 1) < 1) {
      const h = 0.8;
      return const [
        Rect.fromLTWH(0, 0, 0.6, h),
        Rect.fromLTWH(0.6, 0, 0.4, h / 2),
        Rect.fromLTWH(0.6, h / 2, 0.4, h / 2),
      ];
    }
    return const [
      Rect.fromLTWH(0, 0, 1, 0.55),
      Rect.fromLTWH(0, 0.55, 0.5, 0.4),
      Rect.fromLTWH(0.5, 0.55, 0.5, 0.4),
    ];
  }
  // Rows of 3, with rows of 2 first so every row is full.
  final rows = <int>[];
  for (var left = count; left > 0;) {
    final n = left % 3 == 0 ? 3 : 2;
    rows.add(n);
    left -= n;
  }
  final out = <Rect>[];
  var y = 0.0;
  for (final n in rows) {
    final h = n == 3 ? 1 / 3 : (count == 4 ? 0.5 : 0.42);
    for (var i = 0; i < n; i++) {
      out.add(Rect.fromLTWH(i / n, y, 1 / n, h));
    }
    y += h;
  }
  return out;
}

/// Owner 2026-10-19 («photos in the chat look blurred»): a chat photo
/// decoded for its box × the screen's pixel ratio from the stored photo
/// (not the 320 px preview, which a 3× phone stretched to ~660 px). The
/// preview shows while the photo loads; the viewer reuses the same file
/// from the disk cache.
class ChatPhoto extends StatelessWidget {
  const ChatPhoto({required this.attachment, required this.size, super.key});

  final ChatAttachment attachment;
  final Size size;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final a = attachment;
    final dpr = MediaQuery.devicePixelRatioOf(context);
    final r = chatAspectOf(a);
    // Cover: the photo's width that fills the box both ways.
    final logical = r == null
        ? math.max(size.width, size.height)
        : math.max(size.width, size.height * r);
    final px = math.min(2048, ((logical * dpr) / 64).ceil() * 64);
    final skeleton = ColoredBox(color: colors.skeletonBase);
    if (a.localBytes != null) {
      return Image.memory(
        a.localBytes!,
        fit: BoxFit.cover,
        cacheWidth: px,
        gaplessPlayback: true,
      );
    }
    final main = a.url ?? a.previewUrl;
    if (main == null) return skeleton;
    final preview = a.previewUrl != null && a.previewUrl != main
        ? Image(
            image: appNetworkImage(
              a.previewUrl!,
              320,
              cache: AppImageCaches.chatMedia,
            ),
            fit: BoxFit.cover,
            errorBuilder: (_, __, ___) => skeleton,
          )
        : skeleton;
    return Image(
      image: appNetworkImage(main, px, cache: AppImageCaches.chatMedia),
      fit: BoxFit.cover,
      gaplessPlayback: true,
      frameBuilder: (_, child, frame, sync) =>
          frame != null || sync ? child : preview,
      errorBuilder: (_, __, ___) => preview,
    );
  }
}

/// One cell of an album.
@immutable
class ChatAlbumItem {
  const ChatAlbumItem({
    required this.attachment,
    this.id,
    this.sending = false,
    this.failed = false,
    this.onRetry,
  });

  /// The message it belongs to (keys the cell).
  final String? id;
  final ChatAttachment attachment;
  final bool sending;
  final bool failed;
  final VoidCallback? onRetry;
}

/// Owner 2026-10-19 (Telegram / WhatsApp): photos and videos sent together
/// in one grid; a tap opens the viewer at that photo, swiping through the
/// album; each cell shows its own upload progress.
class ChatMediaAlbum extends ConsumerWidget {
  const ChatMediaAlbum({required this.items, this.width, super.key});

  final List<ChatAlbumItem> items;

  /// Defaults to [chatMediaLimits]' width.
  final double? width;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final w = width ?? chatMediaLimits(context).maxWidth;
    final aspects = [for (final i in items) chatAspectOf(i.attachment)];
    final known = aspects.whereType<double>().toList();
    final cells = chatAlbumLayout(
      items.length,
      firstAspect: aspects.firstOrNull,
      avg: known.isEmpty ? null : known.reduce((x, y) => x + y) / known.length,
    );
    final height = cells.map((c) => c.bottom).reduce(math.max) * w;
    final photos = [
      for (final i in items)
        if (i.attachment.isImage && !i.attachment.isVideo) i.attachment.url,
    ];
    final gallery = photos.whereType<String>().toList();
    const gap = 1.0;

    Widget cell(ChatAlbumItem item, Rect r) {
      final a = item.attachment;
      final box = Size(r.width * w, r.height * w);
      final pct = a.progress > 0 && a.progress < 1 ? a.progress : null;
      final Widget body;
      if (a.isVideo) {
        body = ChatVideoTile(
          attachment: a,
          sending: item.sending,
          playLabel: t.t('chat.attach.videoPlay'),
          fill: true,
        );
      } else {
        body = Semantics(
          button: a.url != null,
          image: true,
          label: t.t('chat.attach.photo'),
          child: AppPressable(
            onTap: a.url == null || !gallery.contains(a.url)
                ? () {}
                : () => showPhotoGallery(
                      context,
                      urls: gallery,
                      initial: gallery.indexOf(a.url!),
                      closeLabel: t.t('common.close'),
                    ),
            child: Stack(
              fit: StackFit.expand,
              children: [
                ChatPhoto(attachment: a, size: box),
                if (item.sending)
                  ColoredBox(
                    color: Colors.black26,
                    child: Center(
                      child: SizedBox.square(
                        dimension: 28,
                        child: CircularProgressIndicator(
                          value: pct,
                          strokeWidth: 3,
                          color: Colors.white,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        );
      }
      return Positioned(
        key: item.id == null ? null : ValueKey(item.id),
        left: r.left * w + (r.left > 0 ? gap : 0),
        top: r.top * w + (r.top > 0 ? gap : 0),
        width: box.width - (r.left > 0 ? gap : 0) - (r.right < 0.999 ? gap : 0),
        height: box.height -
            (r.top > 0 ? gap : 0) -
            (r.bottom * w < height - 0.5 ? gap : 0),
        child: item.failed
            ? Stack(
                fit: StackFit.expand,
                children: [
                  body,
                  Semantics(
                    button: item.onRetry != null,
                    label: t.t('error.retry'),
                    child: AppPressable(
                      onTap: item.onRetry,
                      child: ColoredBox(
                        color: Colors.black38,
                        child: Center(
                          child: AppIcon(
                            AppIcons.errorOutlineRounded,
                            color: colors.danger,
                            size: 28,
                          ),
                        ),
                      ),
                    ),
                  ),
                ],
              )
            : body,
      );
    }

    return ClipRRect(
      borderRadius: BorderRadius.circular(12),
      child: SizedBox(
        width: w,
        height: height,
        child: Stack(
          children: [
            for (var i = 0; i < items.length && i < cells.length; i++)
              cell(items[i], cells[i]),
          ],
        ),
      ),
    );
  }
}

/// A document card inside a bubble (tap → the phone's viewer), with the
/// upload progress while sending.
class ChatDocumentRow extends StatelessWidget {
  const ChatDocumentRow({
    required this.attachment,
    required this.fg,
    this.sending = false,
    this.width,
    this.onOpen,
    super.key,
  });

  final ChatAttachment attachment;
  final Color fg;
  final bool sending;
  final double? width;

  /// Replaces opening the file outside the app (owner 2026-10-21: a group
  /// that restricts saving content says so instead).
  final VoidCallback? onOpen;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final a = attachment;
    final look = docLook(a.extension);
    final pct = a.progress > 0 && a.progress < 1 ? a.progress : null;
    return Semantics(
      button: a.url != null,
      label: '${a.name}, ${fileSizeLabel(a.sizeBytes)}',
      excludeSemantics: true,
      child: AppPressable(
        onTap:
            a.url == null ? () {} : (onOpen ?? () => openCaseDocument(a.url!)),
        child: SizedBox(
          width: width ?? 240,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  Container(
                    width: 44,
                    height: 44,
                    decoration: BoxDecoration(
                      color: look.color,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        AppIcon(look.icon, size: 20, color: Colors.white),
                        if (a.extension.isNotEmpty)
                          Text(
                            a.extension.toUpperCase(),
                            maxLines: 1,
                            style: type.caption.copyWith(
                              color: Colors.white,
                              fontSize: (type.caption.fontSize ?? 12) * 2 / 3,
                              fontWeight: FontWeight.w700,
                              height: 1,
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          a.name,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall.copyWith(
                            color: fg,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        Text(
                          [
                            fileSizeLabel(a.sizeBytes),
                            if (a.extension.isNotEmpty)
                              a.extension.toUpperCase(),
                          ].where((s) => s.isNotEmpty).join(' · '),
                          style: type.caption
                              .copyWith(color: fg.withValues(alpha: 0.75)),
                        ),
                      ],
                    ),
                  ),
                  if (a.url != null)
                    AppIcon(
                      AppIcons.openInNewRounded,
                      size: 18,
                      color: fg.withValues(alpha: 0.75),
                    ),
                ],
              ),
              if (sending)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.xs),
                  child: LinearProgressIndicator(
                    value: pct,
                    minHeight: 3,
                    color: fg,
                    backgroundColor: fg.withValues(alpha: 0.2),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-19: the inside of a grouped bubble — an album of photos and
/// videos, or a list of documents — and the caption of the newest message
/// under it. [onRetry] resends one failed item.
class ChatAttachmentGroupBody extends StatelessWidget {
  const ChatAttachmentGroupBody({
    required this.messages,
    required this.mine,
    this.onRetry,
    this.captionPadding = EdgeInsets.zero,
    super.key,
  });

  /// Oldest first, every one an attachment.
  final List<ChatMessage> messages;
  final bool mine;
  final void Function(ChatMessage m)? onRetry;

  /// Owner 2026-10-22: the caption's text inset when the album fills the
  /// bubble edge to edge.
  final EdgeInsetsGeometry captionPadding;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final w = chatMediaLimits(context).maxWidth;
    final caption = messages.last.body.trim();
    final media = isChatMedia(messages.first.attachment!);
    final Widget content;
    if (media) {
      content = ChatMediaAlbum(
        width: w,
        items: [
          for (final m in messages)
            ChatAlbumItem(
              id: m.id,
              attachment: m.attachment!,
              sending: m.delivery == DeliveryState.sending,
              failed: m.delivery == DeliveryState.failed,
              onRetry: onRetry == null ? null : () => onRetry!(m),
            ),
        ],
      );
    } else {
      content = Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          for (var i = 0; i < messages.length; i++) ...[
            if (i > 0)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
                child: SizedBox(
                  width: 240,
                  child: Divider(height: 1, color: fg.withValues(alpha: 0.15)),
                ),
              ),
            Row(
              key: ValueKey(messages[i].id),
              mainAxisSize: MainAxisSize.min,
              children: [
                ChatDocumentRow(
                  attachment: messages[i].attachment!,
                  fg: fg,
                  sending: messages[i].delivery == DeliveryState.sending,
                  width:
                      messages[i].delivery == DeliveryState.failed ? 208 : 240,
                ),
                if (messages[i].delivery == DeliveryState.failed)
                  IconButton(
                    tooltip: ProviderScope.containerOf(context, listen: false)
                        .read(translatorProvider)
                        .t('common.retry'),
                    onPressed:
                        onRetry == null ? null : () => onRetry!(messages[i]),
                    icon: AppIcon(
                      AppIcons.errorOutlineRounded,
                      color:
                          Theme.of(context).extension<AppColorTokens>()!.danger,
                      size: 20,
                    ),
                    visualDensity: VisualDensity.compact,
                    constraints: const BoxConstraints.tightFor(
                      width: 32,
                      height: 32,
                    ),
                    padding: EdgeInsets.zero,
                  ),
              ],
            ),
          ],
        ],
      );
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        content,
        if (caption.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xs),
          SizedBox(
            width: media ? w : 240,
            child: Padding(
              padding: captionPadding,
              child: Text(
                caption,
                style: type.body.copyWith(color: fg, height: 1.35),
              ),
            ),
          ),
        ],
      ],
    );
  }
}
