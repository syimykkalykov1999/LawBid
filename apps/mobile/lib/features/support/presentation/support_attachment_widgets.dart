import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/support/domain/support_models.dart';
import 'package:lawbid/features/support/presentation/support_attach_controller.dart';
import 'package:lawbid/shared/presentation/attachment_kit.dart';
import 'package:url_launcher/url_launcher.dart';

const double _thumb = 64;

/// Owner 2026-10-18 (OQ-055): the paperclip of a ticket form / reply bar.
/// Opens the chat's picker (one gallery for photos and videos, camera,
/// files). Quiet colours from the theme: no gold fill.
class SupportAttachButton extends ConsumerWidget {
  const SupportAttachButton({
    required this.controller,
    this.enabled = true,
    super.key,
  });

  final SupportAttachController controller;
  final bool enabled;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) => AppIconButton(
        icon: AppIcon(
          AppIcons.attachFileRounded,
          color: colors.textSecondary,
        ),
        semanticLabel: t.t('support.attach'),
        onPressed:
            enabled && !controller.full ? () => controller.pick(context) : null,
      ),
    );
  }
}

/// The files picked so far: thumbnails with a remove (x), a progress ring
/// while one uploads, a retry on one that failed.
class SupportDraftStrip extends ConsumerWidget {
  const SupportDraftStrip({required this.controller, super.key});

  final SupportAttachController controller;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final files = controller.files;
        if (files.isEmpty) return const SizedBox.shrink();
        return SizedBox(
          height: _thumb + AppSpacing.sm,
          child: ListView.separated(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.only(top: AppSpacing.sm),
            itemCount: files.length,
            separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
            itemBuilder: (_, i) => _DraftTile(
              file: files[i],
              onRemove: () => controller.remove(files[i].key),
              onRetry: () => controller.retry(files[i].key),
            ),
          ),
        );
      },
    );
  }
}

class _DraftTile extends ConsumerWidget {
  const _DraftTile({
    required this.file,
    required this.onRemove,
    required this.onRetry,
  });

  final SupportDraftFile file;
  final VoidCallback onRemove;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final failed = file.state == SupportDraftState.failed;
    final uploading = file.state == SupportDraftState.uploading;
    final Widget face;
    if (file.isImage) {
      face = Image.memory(
        file.bytes,
        fit: BoxFit.cover,
        cacheWidth: 200,
        errorBuilder: (_, __, ___) => ColoredBox(color: colors.skeletonBase),
      );
    } else {
      face = ColoredBox(
        color: colors.chip,
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.xs),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AppIcon(
                file.isVideo
                    ? AppIcons.playArrowRounded
                    : AppIcons.insertDriveFileRounded,
                color: colors.textSecondary,
              ),
              Text(
                file.name,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: type.caption.copyWith(color: colors.text),
              ),
            ],
          ),
        ),
      );
    }
    return SizedBox(
      width: _thumb + AppSpacing.sm,
      height: _thumb + AppSpacing.sm,
      child: Stack(
        children: [
          Positioned(
            left: 0,
            bottom: 0,
            child: Semantics(
              label: file.name,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadii.field),
                child: Container(
                  width: _thumb,
                  height: _thumb,
                  decoration: BoxDecoration(
                    border: Border.all(
                      color: failed ? colors.danger : colors.border,
                    ),
                    borderRadius: BorderRadius.circular(AppRadii.field),
                  ),
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      face,
                      if (uploading || failed)
                        ColoredBox(
                          color: colors.text.withValues(alpha: 0.45),
                          child: Center(
                            child: failed
                                ? AppPressable(
                                    onTap: onRetry,
                                    child: Semantics(
                                      button: true,
                                      label: t.t('error.retry'),
                                      child: AppIcon(
                                        AppIcons.refreshRounded,
                                        color: colors.bg,
                                      ),
                                    ),
                                  )
                                : SizedBox.square(
                                    dimension: 28,
                                    child: CircularProgressIndicator(
                                      value:
                                          file.progress > 0 && file.progress < 1
                                              ? file.progress
                                              : null,
                                      strokeWidth: 3,
                                      color: colors.bg,
                                    ),
                                  ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: 0,
            top: 0,
            child: AppPressable(
              onTap: onRemove,
              child: Semantics(
                button: true,
                label: t.t('support.attach.remove'),
                child: Container(
                  width: 24,
                  height: 24,
                  decoration: BoxDecoration(
                    color: colors.surface,
                    shape: BoxShape.circle,
                    border: Border.all(color: colors.border),
                  ),
                  child: AppIcon(
                    AppIcons.closeRounded,
                    size: 14,
                    color: colors.text,
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// The files of one message in the conversation: photos as thumbnails (tap
/// → full screen), videos with the first frame and a play button (the
/// chat's tile), documents as rows (tap → the phone's viewer).
class SupportMessageFiles extends ConsumerWidget {
  const SupportMessageFiles({required this.attachments, super.key});

  final List<SupportAttachment> attachments;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (attachments.isEmpty) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final urls = [
      for (final a in attachments)
        if (a.isImage && a.url != null) a.url!,
    ];
    final widgets = <Widget>[];
    for (final a in attachments) {
      if (a.isImage) {
        final src = a.previewUrl ?? a.url;
        widgets.add(
          Semantics(
            button: a.url != null,
            image: true,
            label: a.name,
            child: AppPressable(
              onTap: a.url == null
                  ? null
                  : () => showPhotoGallery(
                        context,
                        urls: urls,
                        initial: urls.indexOf(a.url!),
                        closeLabel: t.t('common.close'),
                      ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(AppRadii.field),
                child: SizedBox.square(
                  dimension: 132,
                  child: src == null
                      ? ColoredBox(color: colors.skeletonBase)
                      : Image(
                          image: appNetworkImage(src, 400),
                          fit: BoxFit.cover,
                          errorBuilder: (_, __, ___) =>
                              ColoredBox(color: colors.skeletonBase),
                        ),
                ),
              ),
            ),
          ),
        );
      } else if (a.isVideo) {
        widgets.add(
          SizedBox(
            width: 220,
            child: ChatVideoTile(
              attachment: ChatAttachment(
                fileId: a.fileId,
                name: a.name,
                isImage: false,
                mime: a.mime,
                sizeBytes: a.sizeBytes,
                url: a.url,
              ),
              sending: false,
              playLabel: t.t('chat.attach.videoPlay'),
            ),
          ),
        );
      } else {
        widgets.add(
          Semantics(
            button: a.url != null,
            label: '${a.name}, ${fileSizeLabel(a.sizeBytes)}',
            excludeSemantics: true,
            child: AppPressable(
              onTap: a.url == null
                  ? null
                  : () => launchUrl(
                        Uri.parse(a.url!),
                        mode: LaunchMode.externalApplication,
                      ),
              child: Container(
                constraints: const BoxConstraints(minWidth: 200),
                padding: const EdgeInsets.all(AppSpacing.sm),
                decoration: BoxDecoration(
                  color: colors.chip,
                  borderRadius: BorderRadius.circular(AppRadii.field),
                  border: Border.all(color: colors.border),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    AppIcon(
                      AppIcons.insertDriveFileRounded,
                      color: colors.textSecondary,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Flexible(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            a.name,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall.copyWith(color: colors.text),
                          ),
                          Text(
                            fileSizeLabel(a.sizeBytes),
                            style: type.caption.copyWith(
                              color: colors.textSecondary,
                            ),
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
    }
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: Wrap(
        spacing: AppSpacing.sm,
        runSpacing: AppSpacing.sm,
        children: widgets,
      ),
    );
  }
}
