import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner decision 2026-09-30 (OQ-031): 0–9 case photos in the wizard.
/// They upload at once; "Next" waits while any is still uploading.
class CasePhotosPicker extends ConsumerWidget {
  const CasePhotosPicker({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final photos =
        ref.watch(createCaseControllerProvider.select((s) => s.photos));
    final c = ref.read(createCaseControllerProvider.notifier);
    // Owner 2026-10-07 (bug 17): count and formats from the admin.
    final upload = ref.watch(uploadLimitsProvider)[UploadPlace.kase];
    final maxFiles = upload.maxFiles;

    Future<void> pick() async {
      final left = maxFiles - photos.length;
      if (left <= 0) return;
      final limits = photoLimitsOf(ref.read(featureFlagsControllerProvider));
      final picked = await ImagePicker().pickMultiImage(
        maxWidth: limits.maxPx,
        maxHeight: limits.maxPx,
        imageQuality: limits.quality,
        limit: left > 1 ? left : null,
      );
      final bytes = <Uint8List>[
        for (final f in picked.take(left)) await f.readAsBytes(),
      ];
      c.addPhotos(bytes);
    }

    // OQ-034: PDF / Word documents next to the photos.
    Future<void> pickFiles() async {
      final left = maxFiles - photos.length;
      if (left <= 0) return;
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: upload.documentExtensions,
        allowMultiple: true,
        withData: true,
      );
      final files = [
        for (final f in result?.files ?? const <PlatformFile>[])
          if (f.bytes != null) (bytes: f.bytes!, name: f.name),
      ];
      c.addFiles(files.take(left).toList());
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text.rich(
                TextSpan(
                  text: t.t('cases.photos.title'),
                  style: type.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                  children: [
                    TextSpan(
                      text: ' ${t.t('cases.photos.optional')}',
                      style: type.body.copyWith(
                        color: colors.textSecondary,
                        fontWeight: FontWeight.w400,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            Text(
              ltrIsolate('${photos.length} / $maxFiles'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('cases.photos.privacy', {'max': '$maxFiles'}),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        // Owner 2026-10-19: the two add buttons stand still in their own
        // row (greyed at the limit, never moving); the attachments below
        // go three a row across the full width.
        Row(
          children: [
            Expanded(
              child: _AddButton(
                icon: AppIcons.addPhotoAlternateOutlined,
                label: t.t('cases.photos.tilePhoto'),
                semantic: t.t('cases.photos.add'),
                onTap: photos.length < maxFiles ? pick : null,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: _AddButton(
                icon: AppIcons.noteAddOutlined,
                label: t.t('cases.photos.tileFile'),
                semantic: t.t('cases.files.add'),
                onTap: photos.length < maxFiles ? pickFiles : null,
              ),
            ),
          ],
        ),
        if (photos.length >= maxFiles) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('cases.photos.limitReached', {'max': '$maxFiles'}),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ],
        if (photos.isNotEmpty) const SizedBox(height: AppSpacing.sm),
        LayoutBuilder(
          builder: (context, box) {
            final tile =
                ((box.maxWidth - 2 * AppSpacing.sm) / 3).floorToDouble();
            return Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final p in photos)
                  SizedBox.square(
                    dimension: tile,
                    child: Stack(
                      fit: StackFit.expand,
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadii.field),
                          child: p.isDocument
                              ? _DocTile(name: p.name!)
                              // A photo restored with a saved draft has no
                              // bytes on the device any more.
                              : p.bytes.isEmpty
                                  ? ColoredBox(
                                      color: colors.surface,
                                      child: AppIcon(
                                        AppIcons.imageOutlined,
                                        color: colors.goldDark,
                                      ),
                                    )
                                  : Image.memory(p.bytes, fit: BoxFit.cover),
                        ),
                        if (p.uploading)
                          const Center(
                            child: SizedBox.square(
                              dimension: 24,
                              child: CircularProgressIndicator(strokeWidth: 2),
                            ),
                          ),
                        if (p.failed)
                          Center(
                            child: AppIconButton(
                              plain: false,
                              icon: AppIcon(
                                AppIcons.refreshRounded,
                                color: colors.danger,
                              ),
                              semanticLabel: t.t('error.retry'),
                              onPressed: () => c.retryPhoto(p.key),
                            ),
                          ),
                        Positioned(
                          top: 2,
                          right: 2,
                          child: GestureDetector(
                            onTap: () => c.removePhoto(p.key),
                            child: Semantics(
                              button: true,
                              label: t.t('cases.photos.remove'),
                              child: Container(
                                decoration: BoxDecoration(
                                  color: colors.bg.withValues(alpha: 0.85),
                                  shape: BoxShape.circle,
                                ),
                                padding: const EdgeInsets.all(2),
                                child: AppIcon(
                                  AppIcons.closeRounded,
                                  size: 18,
                                  color: colors.text,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            );
          },
        ),
        if (photos.any((p) => p.failed)) ...[
          const SizedBox(height: AppSpacing.sm),
          Semantics(
            liveRegion: true,
            child: Text(
              t.t('cases.photos.failedHint'),
              style: type.caption.copyWith(color: colors.dangerText),
            ),
          ),
        ],
      ],
    );
  }
}

/// Icon with a short caption under it, centred in an add tile.
/// «Фото» / «Файл»: fixed in place; [onTap] null = the limit is reached
/// (greyed, not hidden).
class _AddButton extends StatelessWidget {
  const _AddButton({
    required this.icon,
    required this.label,
    required this.semantic,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final String semantic;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final enabled = onTap != null;
    return Semantics(
      button: true,
      enabled: enabled,
      label: semantic,
      child: Opacity(
        opacity: enabled ? 1 : 0.45,
        child: AppPressable(
          onTap: onTap,
          child: Container(
            height: 48,
            // Owner 2026-10-18: the theme's own tile (no gold fill).
            decoration: BoxDecoration(
              color: colors.chip,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AppIcon(icon, color: colors.textSecondary),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  label,
                  style: type.body.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// OQ-031: photos on a case detail. [photos] empty and [hiddenCount] > 0
/// → a note that they open after the attorney's bid is accepted.
class CasePhotosStrip extends ConsumerWidget {
  const CasePhotosStrip({
    required this.photos,
    this.hiddenCount = 0,
    super.key,
  });

  final List<CasePhoto> photos;
  final int hiddenCount;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    if (photos.isEmpty) {
      return Row(
        children: [
          AppIcon(
            AppIcons.lockOutlineRounded,
            size: AppSizes.iconSm,
            color: colors.goldDark,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              t.t('cases.photos.locked', {'count': '$hiddenCount'}),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      );
    }
    // Centred when they fit; a horizontal scroll when there are more.
    return SizedBox(
      height: 112,
      child: LayoutBuilder(
        builder: (context, box) => SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          child: ConstrainedBox(
            constraints: BoxConstraints(minWidth: box.maxWidth),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 0; i < photos.length; i++) ...[
                  if (i > 0) const SizedBox(width: AppSpacing.sm),
                  _tile(context, t, i),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _tile(BuildContext context, Translator t, int i) {
    final p = photos[i];
    // OQ-034: documents open in the system viewer.
    if (!p.isImage) {
      final pdf = p.mime == 'application/pdf';
      return AppPressable(
        onTap: () => openCaseDocument(p.url),
        child: Semantics(
          button: true,
          label: t.t('cases.files.open'),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.field),
            child: SizedBox.square(
              dimension: 112,
              child: _DocTile(
                name: '${t.t('cases.files.document')} ${i + 1}'
                    '${pdf ? '.pdf' : '.docx'}',
              ),
            ),
          ),
        ),
      );
    }
    final images = [
      for (final x in photos)
        if (x.isImage) x.url,
    ];
    return AppPressable(
      onTap: () => showPhotoGallery(
        context,
        urls: images,
        initial: images.indexOf(p.url),
        closeLabel: t.t('common.close'),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: Image(
          image: appNetworkImage(p.previewUrl, 336),
          width: 112,
          height: 112,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Image(
            image: appNetworkImage(p.url, 336),
            width: 112,
            height: 112,
            fit: BoxFit.cover,
          ),
        ),
      ),
    );
  }
}

/// OQ-034: a document tile (PDF / Word) with its name.
class _DocTile extends StatelessWidget {
  const _DocTile({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final pdf = name.toLowerCase().endsWith('.pdf');
    return Container(
      color: colors.surface,
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AppIcon(
            pdf ? AppIcons.pictureAsPdfRounded : AppIcons.descriptionRounded,
            size: 36,
            color: colors.goldDark,
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            name,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            textAlign: TextAlign.center,
            style: type.caption.copyWith(color: colors.text),
          ),
        ],
      ),
    );
  }
}

/// Opens a case document (PDF / Word) in the system viewer.
Future<void> openCaseDocument(String url) =>
    launchUrl(Uri.parse(url), mode: LaunchMode.externalApplication);
