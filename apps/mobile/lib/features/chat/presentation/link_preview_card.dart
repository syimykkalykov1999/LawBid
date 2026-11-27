import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/cache/chat_media_providers.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart'
    show decodeWidthFor;
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/features/chat/application/link_preview_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-22 (checklist, link previews): the card under a message
/// that carries a web address — picture, site, title, a line of text
/// (WhatsApp / Telegram). Owner 27.11: always the same size (a waiting or
/// empty card until the server answered); nothing at all while the Privacy
/// switch is off.
class LinkPreviewCard extends ConsumerStatefulWidget {
  const LinkPreviewCard({
    required this.url,
    required this.mine,
    this.conversationId,
    this.sealed,
    super.key,
  });

  /// Third pass S3: the card that came inside an end-to-end encrypted
  /// message (built on the sender's phone). When set, nothing is asked of
  /// the server and its picture is the bytes it carries.
  final SealedLinkCard? sealed;

  final String url;
  final bool mine;

  /// The chat the message is in: the card's picture is counted under it in
  /// «Данные и память → По чатам» instead of «Прочее».
  final String? conversationId;

  @override
  ConsumerState<LinkPreviewCard> createState() => _LinkPreviewCardState();
}

class _LinkPreviewCardState extends ConsumerState<LinkPreviewCard> {
  String get url => widget.url;
  bool get mine => widget.mine;

  /// The chat and picture last noted, so a rebuild notes nothing twice.
  String? _noted;

  /// Counts the picture under its chat, once it is on screen (so nothing is
  /// asked of the server while the Privacy switch is off).
  void _noteOnce(String? image) {
    final chatId = widget.conversationId;
    if (chatId == null || image == null) return;
    final key = '$chatId|$image';
    if (_noted == key) return;
    _noted = key;
    unawaited(_noteImage(chatId, image));
  }

  /// Remembers which chat shows the picture (for «Данные и память»). Never
  /// throws: a card must draw even when the index cannot be written.
  Future<void> _noteImage(String chatId, String image) async {
    try {
      await ref.read(chatMediaIndexProvider).note(chatId, [image]);
    } on Object catch (e) {
      debugPrint('chat media index: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(linkPreviewsEnabledProvider)) {
      return const SizedBox.shrink();
    }
    final sealed = widget.sealed;
    final preview = sealed != null
        ? LinkPreview(
            url: sealed.url,
            title: sealed.title,
            description: sealed.description,
            siteName: sealed.siteName,
          )
        : ref.watch(linkPreviewProvider(url)).value;
    // Owner 27.11 («скачки везде»; WhatsApp / Telegram): the card has its
    // final size from the first frame — while the preview loads, and when
    // the site gives nothing, the same card (the address, a link sign), so
    // the bubble never grows under the text a moment later.
    final loading = sealed == null &&
        preview == null &&
        ref.watch(linkPreviewProvider(url)).isLoading;
    final shown = preview ?? LinkPreview(url: url);
    final thumbnail = sealed?.thumbnail;
    _noteOnce(shown.imageUrl);
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final meta = mine ? chat.mineMeta : chat.theirsMeta;
    final host = Uri.tryParse(shown.url)?.host ?? '';
    final site = shown.siteName ?? host;
    final siteStyle = type.caption.copyWith(color: meta);
    final titleStyle = type.bodySmall.copyWith(
      color: fg,
      fontWeight: FontWeight.w600,
    );
    final Widget picture;
    if (thumbnail != null) {
      picture = Image.memory(
        thumbnail,
        fit: BoxFit.cover,
        gaplessPlayback: true,
        errorBuilder: (_, __, ___) => const SizedBox.shrink(),
      );
    } else if (shown.imageUrl != null) {
      picture = CachedNetworkImage(
        imageUrl: shown.imageUrl!,
        cacheManager: AppImageCaches.chatMedia,
        fit: BoxFit.cover,
        memCacheWidth: decodeWidthFor(
          math.min(240, MediaQuery.sizeOf(context).width),
        ),
        placeholder: (ctx, _) => ColoredBox(color: colors.skeletonBase),
        fadeInDuration: Duration.zero,
        errorWidget: (_, __, ___) => const SizedBox.shrink(),
      );
    } else if (loading) {
      picture = ColoredBox(color: colors.skeletonBase);
    } else {
      picture = Center(
        child: AppIcon(AppIcons.linkRounded, size: 32, color: meta),
      );
    }
    // The lines the card keeps room for, whatever the site sends.
    Widget lines({required bool real}) => Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              real ? site : ' ',
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: siteStyle,
            ),
            Text(
              real ? (shown.title ?? '') : ' \n ',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: titleStyle,
            ),
            Text(
              real ? (shown.description ?? '') : ' \n ',
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: siteStyle,
            ),
          ],
        );
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Semantics(
        button: true,
        label: [
          t.t('chat.linkPreview.label'),
          site,
          shown.title ?? '',
        ].where((s) => s.isNotEmpty).join(', '),
        excludeSemantics: true,
        child: AppPressable(
          onTap: () => _open(shown.url),
          child: Container(
            key: ValueKey('link-preview-$url'),
            width: 240,
            clipBehavior: Clip.antiAlias,
            decoration: BoxDecoration(
              color: fg.withValues(alpha: 0.08),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                AspectRatio(aspectRatio: 1.91, child: picture),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: Stack(
                    children: [
                      ExcludeSemantics(
                        child: Opacity(opacity: 0, child: lines(real: false)),
                      ),
                      Positioned.fill(
                        child: ClipRect(child: lines(real: true)),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _open(String url) async {
    final uri = Uri.tryParse(url);
    if (uri == null) return;
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } on Object {
      // Nothing can open it; the card stays.
    }
  }
}
