import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/mention_suggestions.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';

/// One photo in the composer: uploaded right after it is picked, so
/// "Опубликовать" only waits for what is still in flight.
class _Photo {
  _Photo(this.bytes);

  final Uint8List bytes;
  final key = UniqueKey();
  double progress = 0;
  String? fileId;
  Object? error;

  bool get uploading => fileId == null && error == null;
}

/// docs/05 §3.1 "+" → "Пост в ленту" (verified attorneys): text with a
/// counter, up to 10 photos in the chosen order, the disclaimer.
class CreatePostScreen extends ConsumerStatefulWidget {
  const CreatePostScreen({super.key});

  @override
  ConsumerState<CreatePostScreen> createState() => _CreatePostScreenState();
}

class _CreatePostScreenState extends ConsumerState<CreatePostScreen> {
  final _text = TextEditingController();
  final _photos = <_Photo>[];
  bool _publishing = false;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _pick() async {
    final left = kPostMaxPhotos - _photos.length;
    if (left <= 0) return;
    final picked = await ImagePicker().pickMultiImage(
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 90,
      limit: left,
    );
    for (final file in picked.take(left)) {
      final photo = _Photo(await file.readAsBytes());
      if (!mounted) return;
      setState(() => _photos.add(photo));
      _upload(photo);
    }
  }

  Future<void> _upload(_Photo photo) async {
    setState(() {
      photo
        ..error = null
        ..progress = 0;
    });
    try {
      final id = await ref.read(socialActionsProvider).uploadPhoto(
        photo.bytes,
        onProgress: (p) {
          if (mounted) setState(() => photo.progress = p);
        },
      );
      if (mounted) setState(() => photo.fileId = id);
    } on Object catch (e) {
      if (mounted) setState(() => photo.error = e);
    }
  }

  bool get _canPublish =>
      !_publishing &&
      _text.text.trim().isNotEmpty &&
      _photos.every((p) => p.fileId != null);

  Future<void> _publish() async {
    final t = ref.read(translatorProvider);
    if (!_canPublish) return;
    setState(() => _publishing = true);
    try {
      final post = await ref.read(socialRepositoryProvider).createPost(
        _text.text.trim(),
        [for (final p in _photos) p.fileId!],
      );
      if (!mounted) return;
      ref.read(feedProvider.notifier).prepend(post);
      HapticFeedback.mediumImpact();
      showAppSnackBar(context, t.t('post.published'));
      Navigator.of(context).pop();
    } on Object catch (e) {
      if (mounted) {
        setState(() => _publishing = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const Icon(Icons.close_rounded),
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(t.t('post.create.title')),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                children: [
                  PostTextField(
                    controller: _text,
                    autofocus: true,
                    hint: t.t('post.create.hint'),
                  ),
                  // OQ-042: "@…" suggests people to mention.
                  MentionSuggestions(controller: _text),
                  const SizedBox(height: AppSpacing.lg),
                  Row(
                    children: [
                      Text(t.t('post.create.photos'), style: type.titleMedium),
                      const Spacer(),
                      Text(
                        '${_photos.length} / $kPostMaxPhotos',
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  SizedBox(
                    height: 112,
                    child: ReorderableListView(
                      scrollDirection: Axis.horizontal,
                      buildDefaultDragHandles: false,
                      proxyDecorator: (child, _, __) =>
                          Material(color: Colors.transparent, child: child),
                      onReorder: (from, to) => setState(() {
                        final p = _photos.removeAt(from);
                        _photos.insert(to > from ? to - 1 : to, p);
                      }),
                      footer: _photos.length < kPostMaxPhotos
                          ? _AddPhotoTile(
                              label: t.t('post.create.addPhoto'),
                              onTap: _pick,
                            )
                          : null,
                      children: [
                        for (var i = 0; i < _photos.length; i++)
                          ReorderableDelayedDragStartListener(
                            key: _photos[i].key,
                            index: i,
                            child: _PhotoTile(
                              photo: _photos[i],
                              index: i,
                              removeLabel: t.t('post.create.removePhoto'),
                              retryLabel: t.t('error.retry'),
                              onRemove: () =>
                                  setState(() => _photos.removeAt(i)),
                              onRetry: () => _upload(_photos[i]),
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (_photos.length > 1)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xs),
                      child: Text(
                        t.t('post.create.reorderHint'),
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    ),
                  const SizedBox(height: AppSpacing.xl),
                  const PostDisclaimer(),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: ValueListenableBuilder<TextEditingValue>(
                valueListenable: _text,
                builder: (context, _, __) => AppButton(
                  label: t.t('post.create.publish'),
                  icon: Icons.send_rounded,
                  isLoading: _publishing,
                  isEnabled: _canPublish,
                  onPressed: _publish,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AddPhotoTile extends StatelessWidget {
  const _AddPhotoTile({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          width: 104,
          margin: const EdgeInsets.only(right: AppSpacing.sm),
          decoration: BoxDecoration(
            color: colors.goldTint,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.goldStroke),
          ),
          child: Icon(Icons.add_photo_alternate_outlined,
              color: colors.goldDark, size: AppSizes.iconLg),
        ),
      ),
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({
    required this.photo,
    required this.index,
    required this.removeLabel,
    required this.retryLabel,
    required this.onRemove,
    required this.onRetry,
  });

  final _Photo photo;
  final int index;
  final String removeLabel;
  final String retryLabel;
  final VoidCallback onRemove;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      width: 104,
      margin: const EdgeInsets.only(right: AppSpacing.sm),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.card),
        child: Stack(
          fit: StackFit.expand,
          children: [
            Image.memory(photo.bytes, fit: BoxFit.cover, cacheWidth: 312),
            if (photo.uploading)
              ColoredBox(
                color: colors.navy.withValues(alpha: 0.45),
                child: Center(
                  child: SizedBox.square(
                    dimension: 36,
                    child: CircularProgressIndicator(
                      value: photo.progress > 0 ? photo.progress : null,
                      strokeWidth: 3,
                      color: colors.gold,
                    ),
                  ),
                ),
              ),
            if (photo.error != null)
              ColoredBox(
                color: colors.navy.withValues(alpha: 0.6),
                child: Center(
                  child: AppIconButton(
                    icon:
                        const Icon(Icons.refresh_rounded, color: Colors.white),
                    semanticLabel: retryLabel,
                    onPressed: onRetry,
                  ),
                ),
              ),
            Positioned(
              left: 6,
              top: 6,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 6),
                decoration: BoxDecoration(
                  color: colors.navy.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: Text('${index + 1}',
                    style: type.caption.copyWith(color: Colors.white)),
              ),
            ),
            Positioned(
              right: 0,
              top: 0,
              child: AppIconButton(
                icon: const Icon(Icons.cancel_rounded, color: Colors.white),
                semanticLabel: removeLabel,
                onPressed: onRemove,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
