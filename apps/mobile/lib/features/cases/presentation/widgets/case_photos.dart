import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/create_case_controller.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

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
    final photos = ref.watch(createCaseControllerProvider.select((s) => s.photos));
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

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(t.t('cases.photos.title'),
                  style: type.body.copyWith(
                      color: colors.text, fontWeight: FontWeight.w600)),
            ),
            Text('${photos.length} / $kCaseMaxPhotos',
                style: type.caption.copyWith(color: colors.textSecondary)),
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(t.t('cases.photos.privacy'),
            style: type.caption.copyWith(color: colors.textSecondary)),
        const SizedBox(height: AppSpacing.sm),
        Wrap(
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
                      child: Image.memory(p.bytes, fit: BoxFit.cover),
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
                          icon: Icon(Icons.refresh_rounded, color: colors.danger),
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
                            child: Icon(Icons.close_rounded,
                                size: 18, color: colors.text),
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
                    child: Icon(Icons.add_photo_alternate_outlined,
                        color: colors.goldDark),
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
          Icon(Icons.lock_outline_rounded, size: AppSizes.iconSm, color: colors.goldDark),
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
    return SizedBox(
      height: 112,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: photos.length,
        separatorBuilder: (_, __) => const SizedBox(width: AppSpacing.sm),
        itemBuilder: (context, i) => AppPressable(
          onTap: () => showDialog<void>(
            context: context,
            builder: (_) => Dialog(
              insetPadding: const EdgeInsets.all(AppSpacing.md),
              backgroundColor: Colors.black,
              child: InteractiveViewer(
                child: Image.network(photos[i].url, fit: BoxFit.contain),
              ),
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.field),
            child: Image.network(
              photos[i].previewUrl,
              width: 112,
              height: 112,
              fit: BoxFit.cover,
              errorBuilder: (_, __, ___) => Image.network(
                photos[i].url,
                width: 112,
                height: 112,
                fit: BoxFit.cover,
              ),
            ),
          ),
        ),
      ),
    );
  }
}
