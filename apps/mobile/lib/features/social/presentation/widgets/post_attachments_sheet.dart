import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/post_documents.dart';

/// Owner 2026-10-07 (bug 13): one small «Посмотреть · N» button under a
/// post or a reel with documents; the photos and files open in a sheet.
class PostAttachmentsButton extends ConsumerWidget {
  const PostAttachmentsButton({
    required this.media,
    required this.documents,
    this.onDark = false,
    super.key,
  });

  final List<PostMedia> media;
  final List<PostAttachment> documents;

  /// Over a reel's video.
  final bool onDark;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final fg = onDark ? Colors.white : colors.text;
    final count = media.length + documents.length;
    return Align(
      alignment: AlignmentDirectional.centerStart,
      child: Semantics(
        button: true,
        child: AppPressable(
          onTap: () => showPostAttachmentsSheet(
            context,
            media: media,
            documents: documents,
          ),
          child: Container(
            constraints: const BoxConstraints(minHeight: 32),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            decoration: BoxDecoration(
              color: onDark ? Colors.black.withValues(alpha: 0.35) : null,
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(
                color: onDark ? Colors.white38 : colors.border,
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                AppIcon(AppIcons.attachFileRounded, size: 16, color: fg),
                const SizedBox(width: AppSpacing.xs),
                Text(
                  t.t('post.attach.view', {'count': '$count'}),
                  maxLines: 1,
                  style: type.bodySmall.copyWith(
                    color: fg,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

Future<void> showPostAttachmentsSheet(
  BuildContext context, {
  required List<PostMedia> media,
  required List<PostAttachment> documents,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => PostAttachmentsSheet(media: media, documents: documents),
    );

enum _Show { all, photos, files }

class PostAttachmentsSheet extends ConsumerStatefulWidget {
  const PostAttachmentsSheet({
    required this.media,
    required this.documents,
    super.key,
  });

  final List<PostMedia> media;
  final List<PostAttachment> documents;

  @override
  ConsumerState<PostAttachmentsSheet> createState() =>
      _PostAttachmentsSheetState();
}

class _PostAttachmentsSheetState extends ConsumerState<PostAttachmentsSheet> {
  var _show = _Show.all;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final media = widget.media;
    final docs = widget.documents;
    final photos = _show != _Show.files && media.isNotEmpty;
    final files = _show != _Show.photos && docs.isNotEmpty;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.85,
        ),
        child: ListView(
          shrinkWrap: true,
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          children: [
            const AppSheetHandle(),
            Text(
              t.t('post.attach.title', {
                'count': '${media.length + docs.length}',
              }),
              textAlign: TextAlign.center,
              style: type.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w700,
              ),
            ),
            if (media.isNotEmpty && docs.isNotEmpty) ...[
              const SizedBox(height: AppSpacing.md),
              Wrap(
                spacing: AppSpacing.sm,
                children: [
                  for (final (s, label) in [
                    (_Show.all, t.t('post.attach.all')),
                    (
                      _Show.photos,
                      t.t('post.attach.photos', {'count': '${media.length}'}),
                    ),
                    (
                      _Show.files,
                      t.t('post.attach.files', {'count': '${docs.length}'}),
                    ),
                  ])
                    AppChip(
                      label: label,
                      height: 32,
                      selected: _show == s,
                      onTap: () => setState(() => _show = s),
                    ),
                ],
              ),
            ],
            if (photos) ...[
              const SizedBox(height: AppSpacing.md),
              GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                mainAxisSpacing: AppSpacing.xs,
                crossAxisSpacing: AppSpacing.xs,
                children: [
                  for (var i = 0; i < media.length; i++)
                    Semantics(
                      button: true,
                      label: t.t('reels.inside.photoOpen', {'n': '${i + 1}'}),
                      excludeSemantics: true,
                      child: GestureDetector(
                        onTap: () => showPhotoGallery(
                          context,
                          urls: [for (final m in media) m.url],
                          initial: i,
                          closeLabel: t.t('common.close'),
                        ),
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadii.field),
                          child: CachedNetworkImage(
                            imageUrl: media[i].previewUrl,
                            fit: BoxFit.cover,
                            errorWidget: (_, __, ___) =>
                                ColoredBox(color: colors.surface),
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ],
            if (files) ...[
              const SizedBox(height: AppSpacing.md),
              PostDocumentsList(documents: docs),
            ],
          ],
        ),
      ),
    );
  }
}
