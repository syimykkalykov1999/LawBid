import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner decision 2026-09-30 (OQ-031): 0–9 case photos in the wizard.
/// They upload at once; "Next" waits while any is still uploading.
class CasePhotosPicker extends ConsumerWidget {
  const CasePhotosPicker({super.key});

  static const double _tile = 96;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final photos =
        ref.watch(createCaseControllerProvider.select((s) => s.photos));
    final c = ref.read(createCaseControllerProvider.notifier);

    Future<void> pick() async {
      final left = kCaseMaxPhotos - photos.length;
      if (left <= 0) return;
      final picked = await ImagePicker().pickMultiImage(
        maxWidth: 2048,
        maxHeight: 2048,
        imageQuality: 90,
        limit: left > 1 ? left : null,
      );
      final bytes = <Uint8List>[
        for (final f in picked.take(left)) await f.readAsBytes(),
      ];
      c.addPhotos(bytes);
    }

    // OQ-034: PDF / Word documents next to the photos.
    Future<void> pickFiles() async {
      final left = kCaseMaxPhotos - photos.length;
      if (left <= 0) return;
      final result = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: const ['pdf', 'docx'],
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
              child: Text(
                t.t('cases.photos.title'),
                style: type.body.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            Text(
              '${photos.length} / $kCaseMaxPhotos',
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('cases.photos.privacy'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.sm),
        // Tiles sit centred, not against the left edge.
        Wrap(
          alignment: WrapAlignment.center,
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final p in photos)
              SizedBox.square(
                dimension: _tile,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadii.field),
                      child: p.isDocument
                          ? _DocTile(name: p.name!)
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
            if (photos.length < kCaseMaxPhotos)
              Semantics(
                button: true,
                label: t.t('cases.photos.add'),
                child: AppPressable(
                  onTap: pick,
                  child: Container(
                    width: _tile,
                    height: _tile,
                    decoration: BoxDecoration(
                      color: colors.goldTint,
                      borderRadius: BorderRadius.circular(AppRadii.field),
                      border: Border.all(color: colors.goldStroke),
                    ),
                    child: AppIcon(
                      AppIcons.addPhotoAlternateOutlined,
                      color: colors.goldDark,
                    ),
                  ),
                ),
              ),
            if (photos.length < kCaseMaxPhotos)
              Semantics(
                button: true,
                label: t.t('cases.files.add'),
                child: AppPressable(
                  onTap: pickFiles,
                  child: Container(
                    width: _tile,
                    height: _tile,
                    decoration: BoxDecoration(
                      color: colors.goldTint,
                      borderRadius: BorderRadius.circular(AppRadii.field),
                      border: Border.all(color: colors.goldStroke),
                    ),
                    child: AppIcon(
                      AppIcons.noteAddOutlined,
                      color: colors.goldDark,
                    ),
                  ),
                ),
              ),
          ],
        ),
      ],
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
        child: Image.network(
          p.previewUrl,
          width: 112,
          height: 112,
          fit: BoxFit.cover,
          errorBuilder: (_, __, ___) => Image.network(
            p.url,
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
