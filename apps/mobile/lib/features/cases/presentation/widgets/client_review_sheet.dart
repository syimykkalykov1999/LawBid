import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/photo_limits.dart';
import 'package:lawbid/core/media/photo_metadata.dart';
import 'package:lawbid/core/media/thumb_image.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/profile/application/review_outbox.dart';
import 'package:lawbid/features/profile/data/client_reviews_repository.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart'
    show ReviewPhoto;
import 'package:lawbid/features/social/application/social_providers.dart'
    show SocialActions, socialActionsProvider;

/// OQ-038: "Review the client" on a case in work — the hired attorney
/// rates the client (1–5 stars + optional text). Editable; every signed-in
/// user sees client reviews (owner 2026-09-30).
class ClientReviewAction extends ConsumerWidget {
  const ClientReviewAction({required this.caseId, super.key});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final mine = ref.watch(myClientReviewProvider(caseId)).value;
    return AppListRow(
      icon: AppIcons.starOutlineRounded,
      label: t.t('client.review.action'),
      trailingText: mine == null ? null : '★ ${mine.rating}',
      onTap: () async {
        final saved = await showClientReviewSheet(
          context,
          rating: mine?.rating ?? 0,
          body: mine?.body ?? '',
          photos: [
            for (final p in mine?.photos ?? const <ReviewPhoto>[])
              (fileId: p.fileId, url: p.previewUrl),
          ],
          onSave: (rating, body, photoIds) => ref
              .read(clientReviewsRepositoryProvider)
              .save(caseId, rating: rating, body: body, photoIds: photoIds),
          target: (kind: ReviewTargetKind.caseClient, id: caseId),
        );
        if ((saved ?? false) && context.mounted) {
          ref.invalidate(myClientReviewProvider(caseId));
          showAppSnackBar(context, t.t('client.review.saved'));
        }
      },
    );
  }
}

/// Owner 2026-09-30: the star + text form, shared by the case ("Review
/// the client") and the client's profile (anyone reviews a client).
/// True when saved.
Future<bool?> showClientReviewSheet(
  BuildContext context, {
  required int rating,
  required String body,
  required Future<Object?> Function(
    int rating,
    String body,
    List<String> photoIds,
  ) onSave,
  String titleKey = 'client.review.title',
  String hintKey = 'client.review.hint',
  List<ReviewSheetPhoto> photos = const [],
  // Owner 2026-11-08: with a target the review is queued and the sheet
  // closes at once ([onSave] is then not called).
  ReviewTarget? target,
}) =>
    showAppBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _Sheet(
        rating: rating,
        body: body,
        onSave: onSave,
        photos: photos,
        titleKey: titleKey,
        hintKey: hintKey,
        target: target,
      ),
    );

class _Sheet extends ConsumerStatefulWidget {
  const _Sheet({
    required this.rating,
    required this.body,
    required this.onSave,
    required this.titleKey,
    required this.hintKey,
    this.photos = const [],
    this.target,
  });

  final ReviewTarget? target;

  final List<ReviewSheetPhoto> photos;
  final String titleKey;
  final String hintKey;
  final int rating;
  final String body;
  final Future<Object?> Function(
    int rating,
    String body,
    List<String> photoIds,
  ) onSave;

  @override
  ConsumerState<_Sheet> createState() => _SheetState();
}

/// A review photo in the form: already saved (url) or just uploaded.
typedef ReviewSheetPhoto = ({String fileId, String? url});

class _SheetState extends ConsumerState<_Sheet> {
  late int _rating = widget.rating;
  late final _text = TextEditingController(text: widget.body);
  late final List<ReviewSheetPhoto> _photos = [...widget.photos];
  final List<Uint8List> _local = [];
  int _uploading = 0;
  bool _busy = false;

  /// Photos still going up (bytes and their upload).
  final List<({Uint8List bytes, Future<String> task})> _inflight = [];

  /// Owner 2026-10-01 (Google Maps-style): photos; 2026-10-07 (bug 17)
  /// how many and how big — the admin's «Отзывы» limits.
  PlaceUploadLimits get _limits =>
      ref.read(uploadLimitsProvider)[UploadPlace.review];
  int get _maxPhotos => _limits.maxPhotos;

  Future<void> _addPhotos() async {
    final t = ref.read(translatorProvider);
    final room = _maxPhotos - _photos.length - _uploading;
    if (room <= 0) return;
    final limits = photoLimitsOf(ref.read(featureFlagsControllerProvider));
    final picked = await ImagePicker().pickMultiImage(
      imageQuality: limits.quality,
      maxWidth: limits.maxPx,
      maxHeight: limits.maxPx,
      limit: room > 1 ? room : null,
      requestFullMetadata: false,
    );
    // Owner 2026-11-08: every picked photo starts at once (the app-wide
    // limit spaces them), so «Сохранить» can take them all along at any
    // moment — the queued review waits for them, not the sheet.
    final all = <Uint8List>[];
    for (final x in picked.take(room)) {
      all.add(await readPickedPhoto(x));
    }
    if (!mounted) return;
    final actions = ref.read(socialActionsProvider);
    await Future.wait([for (final bytes in all) _upload(actions, bytes, t)]);
  }

  Future<void> _upload(
    SocialActions actions,
    Uint8List bytes,
    Translator t,
  ) async {
    final task = actions.uploadPhoto(
      bytes,
      reviewPhoto: true,
      maxBytes: _limits.fileBytes,
      allowedMimes: _limits.photoMimes,
    );
    final entry = (bytes: bytes, task: task);
    setState(() {
      _uploading++;
      _local.add(bytes);
      _inflight.add(entry);
    });
    try {
      final id = await task;
      if (!mounted) return;
      setState(() => _photos.add((fileId: id, url: null)));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
      _local.remove(bytes);
    } finally {
      _inflight.remove(entry);
      if (mounted) setState(() => _uploading--);
    }
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    // Owner 2026-11-08 (instant): the review goes through the app's queue;
    // the sheet closes at once, photos still uploading are taken along.
    final target = widget.target;
    if (target != null) {
      unawaited(
        ref.read(reviewOutboxProvider).submit(
          target,
          rating: _rating,
          body: _text.text,
          photos: [
            for (final p in _photos)
              (fileId: p.fileId, bytes: null, upload: null),
            for (final f in _inflight)
              (fileId: null, bytes: f.bytes, upload: f.task),
          ],
        ),
      );
      Navigator.of(context).pop(true);
      return;
    }
    setState(() => _busy = true);
    try {
      await widget.onSave(
        _rating,
        _text.text,
        [for (final p in _photos) p.fileId],
      );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Text(
              t.t(widget.titleKey),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t(widget.hintKey),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                for (var i = 1; i <= 5; i++)
                  Semantics(
                    button: true,
                    selected: i <= _rating,
                    label: '$i',
                    child: IconButton(
                      tooltip: t.t('a11y.rateStars', {'count': '$i'}),
                      iconSize: 40,
                      onPressed: () => setState(() => _rating = i),
                      icon: AppIcon(
                        i <= _rating
                            ? AppIcons.starRounded
                            : AppIcons.starOutlineRounded,
                        color: colors.gold,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _text,
              maxLength: 2000,
              tapAnywhere: true,
              maxLines: 6,
            ),
            // Owner 2026-10-01 (Google Maps-style): photos in the review.
            SizedBox(
              height: 76,
              child: ListView(
                scrollDirection: Axis.horizontal,
                children: [
                  if (_photos.length + _uploading < _maxPhotos)
                    Padding(
                      padding:
                          const EdgeInsetsDirectional.only(end: AppSpacing.sm),
                      child: InkWell(
                        key: const ValueKey('review-add-photos'),
                        borderRadius: BorderRadius.circular(AppRadii.field),
                        onTap: _busy ? null : _addPhotos,
                        child: Builder(
                          builder: (context) {
                            // Owner 2026-10-15: the same tonal tile with a
                            // soft icon square as «Gallery / Camera» in «+».
                            final dark =
                                Theme.of(context).brightness == Brightness.dark;
                            final base = practiceCardBase(colors);
                            final tile = Color.alphaBlend(
                              AppColorsFixed.sourceGalleryBlue
                                  .withValues(alpha: 0.16),
                              base,
                            );
                            final accent = readableOn(
                              dark
                                  ? AppColorsFixed.sourceGalleryBlue
                                  : Color.lerp(
                                      colors.info,
                                      Colors.black,
                                      0.45,
                                    )!,
                              tile,
                              min: 3,
                            );
                            return Container(
                              width: 76,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    Color.alphaBlend(
                                      accent.withValues(alpha: 0.12),
                                      colors.surface,
                                    ),
                                    colors.surface,
                                  ],
                                ),
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(
                                  color: accent.withValues(alpha: 0.28),
                                ),
                              ),
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Container(
                                    width: 34,
                                    height: 34,
                                    decoration: BoxDecoration(
                                      color: accent.withValues(alpha: 0.16),
                                      borderRadius: BorderRadius.circular(11),
                                    ),
                                    child: AppIcon(
                                      AppIcons.addAPhotoOutlined,
                                      color: accent,
                                      size: 20,
                                    ),
                                  ),
                                  const SizedBox(height: 4),
                                  Padding(
                                    padding: const EdgeInsets.symmetric(
                                      horizontal: AppSpacing.xs,
                                    ),
                                    child: FitText(
                                      t.t('reviews.photos.add'),
                                      style: type.caption.copyWith(
                                        color: colors.text,
                                        fontWeight: FontWeight.w600,
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            );
                          },
                        ),
                      ),
                    ),
                  for (final (i, p) in _photos.indexed)
                    Padding(
                      padding:
                          const EdgeInsetsDirectional.only(end: AppSpacing.sm),
                      child: Stack(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(AppRadii.field),
                            child: SizedBox.square(
                              dimension: 76,
                              child: p.url != null
                                  ? Image(
                                      image: appNetworkImage(p.url!, 600),
                                      fit: BoxFit.cover,
                                    )
                                  : i < _local.length
                                      ? Image(
                                          image: thumbImage(
                                            context,
                                            _local[i],
                                            maxSide: 76,
                                          ),
                                          fit: BoxFit.cover,
                                        )
                                      : ColoredBox(color: colors.goldTint),
                            ),
                          ),
                          PositionedDirectional(
                            top: 2,
                            end: 2,
                            child: GestureDetector(
                              onTap: () => setState(() {
                                _photos.removeAt(i);
                                if (i < _local.length) _local.removeAt(i);
                              }),
                              child: const CircleAvatar(
                                radius: 11,
                                backgroundColor: Colors.black54,
                                child: AppIcon(
                                  AppIcons.closeRounded,
                                  size: 14,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  for (var i = 0; i < _uploading; i++)
                    const Padding(
                      padding: EdgeInsetsDirectional.only(end: AppSpacing.sm),
                      child: SizedBox.square(
                        dimension: 76,
                        child: Center(
                          child: CircularProgressIndicator(strokeWidth: 2),
                        ),
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: t.t('client.review.save'),
              height: AppSizes.touchTarget,
              onPressed: _rating == 0 || _busy ? null : _save,
            ),
          ],
        ),
      ),
    );
  }
}
