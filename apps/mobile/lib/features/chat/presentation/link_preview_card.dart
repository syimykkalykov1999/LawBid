import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
import 'package:lawbid/features/chat/application/link_preview_providers.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-22 (checklist, link previews): the card under a message
/// that carries a web address — picture, site, title, a line of text
/// (WhatsApp / Telegram). Nothing is drawn until the server answered with
/// something to show; nothing at all while the Privacy switch is off.
class LinkPreviewCard extends ConsumerWidget {
  const LinkPreviewCard({required this.url, required this.mine, super.key});

  final String url;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(linkPreviewsEnabledProvider)) {
      return const SizedBox.shrink();
    }
    final preview = ref.watch(linkPreviewProvider(url)).value;
    if (preview == null) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final meta = mine ? chat.mineMeta : chat.theirsMeta;
    final host = Uri.tryParse(preview.url)?.host ?? '';
    final site = preview.siteName ?? host;
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.xs),
      child: Semantics(
        button: true,
        label: [
          t.t('chat.linkPreview.label'),
          site,
          preview.title ?? '',
        ].where((s) => s.isNotEmpty).join(', '),
        excludeSemantics: true,
        child: AppPressable(
          onTap: () => _open(preview.url),
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
                if (preview.imageUrl != null)
                  AspectRatio(
                    aspectRatio: 1.91,
                    child: CachedNetworkImage(
                      imageUrl: preview.imageUrl!,
                      cacheManager: AppImageCaches.chatMedia,
                      fit: BoxFit.cover,
                      fadeInDuration: Duration.zero,
                      errorWidget: (_, __, ___) => const SizedBox.shrink(),
                    ),
                  ),
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.sm),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      if (site.isNotEmpty)
                        Text(
                          site,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(color: meta),
                        ),
                      if (preview.title != null)
                        Text(
                          preview.title!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.bodySmall.copyWith(
                            color: fg,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      if (preview.description != null)
                        Text(
                          preview.description!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(color: meta),
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
