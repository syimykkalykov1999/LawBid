import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/profile/data/client_reviews_repository.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart'
    show ReviewPhoto;
import 'package:lawbid/features/social/application/social_providers.dart'
    show socialActionsProvider;

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
  });

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

  /// Owner 2026-10-01 (Google Maps-style): up to 10 photos.
  static const _maxPhotos = 10;

  Future<void> _addPhotos() async {
    final t = ref.read(translatorProvider);
    final room = _maxPhotos - _photos.length - _uploading;
    if (room <= 0) return;
    final picked = await ImagePicker().pickMultiImage(
      imageQuality: 85,
      maxWidth: 2048,
      limit: room,
    );
    for (final x in picked.take(room)) {
      final bytes = await x.readAsBytes();
      if (!mounted) return;
      setState(() {
        _uploading++;
        _local.add(bytes);
      });
      try {
        final id = await ref
            .read(socialActionsProvider)
            .uploadPhoto(bytes, reviewPhoto: true);
        if (!mounted) return;
        setState(() => _photos.add((fileId: id, url: null)));
      } on Object catch (e) {
        if (mounted) showAppSnackBar(context, errorText(t, e));
        _local.remove(bytes);
      } finally {
        if (mounted) setState(() => _uploading--);
      }
    }
  }

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
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
                    padding: const EdgeInsets.only(right: AppSpacing.sm),
                    child: InkWell(
                      key: const ValueKey('review-add-photos'),
                      borderRadius: BorderRadius.circular(AppRadii.field),
                      onTap: _busy ? null : _addPhotos,
                      child: Container(
                        width: 76,
                        decoration: BoxDecoration(
                          color: colors.goldTint,
                          borderRadius: BorderRadius.circular(AppRadii.field),
                          border: Border.all(color: colors.gold),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            AppIcon(
                              AppIcons.addAPhotoOutlined,
                              color: colors.goldDark,
                            ),
                            const SizedBox(height: 2),
                            Text(
                              t.t('reviews.photos.add'),
                              style:
                                  type.caption.copyWith(color: colors.goldDark),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                for (final (i, p) in _photos.indexed)
                  Padding(
                    padding: const EdgeInsets.only(right: AppSpacing.sm),
                    child: Stack(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadii.field),
                          child: SizedBox.square(
                            dimension: 76,
                            child: p.url != null
                                ? Image.network(p.url!, fit: BoxFit.cover)
                                : i < _local.length
                                    ? Image.memory(_local[i], fit: BoxFit.cover)
                                    : ColoredBox(color: colors.goldTint),
                          ),
                        ),
                        Positioned(
                          top: 2,
                          right: 2,
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
                    padding: EdgeInsets.only(right: AppSpacing.sm),
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
    );
  }
}
