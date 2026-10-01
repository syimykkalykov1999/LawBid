import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/mention_suggestions.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/shared/domain/user_role.dart';

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

/// Owner 2026-09-30: "+" → a post (everyone) or News (attorneys): the
/// card's title, the text (with @mentions and #tags), the qualification
/// (every category and subcategory, with suggestions while typing), up to
/// 9 photos in the chosen order — without photos the card shows our art of
/// the chosen qualification. [editing]: the same form for an own post
/// (photos stay as published).
class CreatePostScreen extends ConsumerStatefulWidget {
  const CreatePostScreen({this.news = false, this.editing, super.key});

  /// Start as News (attorneys).
  final bool news;
  final Post? editing;

  @override
  ConsumerState<CreatePostScreen> createState() => _CreatePostScreenState();
}

class _CreatePostScreenState extends ConsumerState<CreatePostScreen> {
  late final _title = TextEditingController(
    text: widget.editing?.title ??
        (widget.editing == null ? '' : splitPostBody(widget.editing!.body).$1),
  );
  late final _text = TextEditingController(
    text: widget.editing == null
        ? ''
        : (widget.editing!.title != null
            ? widget.editing!.body
            : splitPostBody(widget.editing!.body).$2),
  );
  final _photos = <_Photo>[];
  late String? _practice = widget.editing?.practice?.code;
  late bool _news = widget.editing?.isNews ?? widget.news;
  bool _publishing = false;
  bool _triedPublish = false;

  bool get _editing => widget.editing != null;

  @override
  void dispose() {
    _title.dispose();
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

  Future<void> _pickPractice() async {
    final t = ref.read(translatorProvider);
    final picked = await OptionPickerSheet.show(
      context,
      title: t.t('post.create.practice'),
      searchHint: t.t('practice.search.hint'),
      initial: {if (_practice != null) _practice!},
      options: practiceOptions(ref),
    );
    if (picked == null || picked.isEmpty) return;
    HapticFeedback.selectionClick();
    setState(() => _practice = picked.first);
  }

  bool get _ready =>
      _title.text.trim().isNotEmpty &&
      _text.text.trim().isNotEmpty &&
      _practice != null &&
      _photos.every((p) => p.fileId != null);

  Future<void> _publish() async {
    final t = ref.read(translatorProvider);
    setState(() => _triedPublish = true);
    if (_publishing || !_ready) return;
    setState(() => _publishing = true);
    try {
      if (_editing) {
        final error = await ref.read(socialActionsProvider).editPost(
              widget.editing!,
              title: _title.text.trim(),
              body: _text.text.trim(),
              practiceCode: _practice,
            );
        if (error != null) throw error;
        if (!mounted) return;
        Navigator.of(context).pop();
        return;
      }
      final post = await ref.read(socialRepositoryProvider).createPost(
            PostDraft(
              title: _title.text.trim(),
              body: _text.text.trim(),
              practiceCode: _practice!,
              isNews: _news,
              mediaFileIds: [for (final p in _photos) p.fileId!],
            ),
          );
      if (!mounted) return;
      ref.read(feedProvider.notifier).prepend(post);
      HapticFeedback.mediumImpact();
      showAppSnackBar(
          context, t.t(_news ? 'post.news.published' : 'post.published'));
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
    final attorney = ref.watch(currentUserRoleProvider) == UserRole.attorney;
    final practice = _practice;
    final missing = _triedPublish;

    Widget label(String text, {bool error = false}) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(
            text,
            style: type.titleMedium
                .copyWith(color: error ? colors.dangerText : colors.text),
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const Icon(Icons.close_rounded),
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(t.t(_editing
            ? 'post.menu.edit'
            : (_news ? 'post.news.create' : 'post.create.title'))),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                children: [
                  // Attorneys: a post or News (owner 2026-09-30).
                  if (attorney && !_editing) ...[
                    _KindToggle(
                      news: _news,
                      postLabel: t.t('post.kind.post'),
                      newsLabel: t.t('post.kind.news'),
                      onChanged: (v) => setState(() => _news = v),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      t.t(_news ? 'post.kind.newsHint' : 'post.kind.postHint'),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  label(t.t('post.create.practice'),
                      error: missing && practice == null),
                  _PracticeField(
                    label: practice == null
                        ? t.t('post.create.practicePick')
                        : practiceLabel(ref, practice),
                    sublabel: practice == null || isPracticeCategory(practice)
                        ? null
                        : practiceLabel(ref, practiceCategoryOf(practice)),
                    icon: practiceGlyph(
                        practice == null ? null : practiceCategoryOf(practice)),
                    empty: practice == null,
                    error: missing && practice == null,
                    onTap: _pickPractice,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  label(t.t('post.create.titleField'),
                      error: missing && _title.text.trim().isEmpty),
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _title,
                    builder: (context, v, _) => AppTextField(
                      controller: _title,
                      hintText: t.t('post.create.titleHint'),
                      semanticLabel: t.t('post.create.titleField'),
                      maxLength: kPostTitleMaxChars,
                      textCapitalization: TextCapitalization.sentences,
                      errorText: missing && v.text.trim().isEmpty
                          ? t.t('post.create.required')
                          : null,
                      onChanged: (_) => setState(() {}),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  label(t.t('post.create.bodyField'),
                      error: missing && _text.text.trim().isEmpty),
                  PostTextField(
                    controller: _text,
                    hint: t.t('post.create.hint'),
                  ),
                  // OQ-042: "@…" suggests people to mention.
                  MentionSuggestions(controller: _text),
                  const SizedBox(height: AppSpacing.lg),
                  if (!_editing) ...[
                    Row(
                      children: [
                        Text(t.t('post.create.photos'),
                            style: type.titleMedium),
                        const Spacer(),
                        Text(
                          '${_photos.length} / $kPostMaxPhotos',
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
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
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      t.t(_photos.length > 1
                          ? 'post.create.reorderHint'
                          : 'post.create.photosHint'),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                    // Without photos: a preview of the art the card gets.
                    if (_photos.isEmpty && practice != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      Text(t.t('post.create.defaultCover'),
                          style: type.caption
                              .copyWith(color: colors.textSecondary)),
                      const SizedBox(height: AppSpacing.xs),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(AppRadii.card),
                        child: AspectRatio(
                          aspectRatio: 2,
                          child: PracticePhoto(
                            categoryCode: practiceCategoryOf(practice),
                            practiceCode: practice,
                          ),
                        ),
                      ),
                    ],
                  ],
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
                  label: t.t(_editing
                      ? 'common.save'
                      : (_news ? 'post.news.publish' : 'post.create.publish')),
                  icon: _editing ? Icons.check_rounded : Icons.send_rounded,
                  isLoading: _publishing,
                  isEnabled:
                      !_publishing && _photos.every((p) => p.fileId != null),
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

/// Post | News switch (attorneys).
class _KindToggle extends StatelessWidget {
  const _KindToggle({
    required this.news,
    required this.postLabel,
    required this.newsLabel,
    required this.onChanged,
  });

  final bool news;
  final String postLabel;
  final String newsLabel;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget seg(String label, IconData icon, bool selected, bool value) =>
        Expanded(
          child: Semantics(
            button: true,
            selected: selected,
            label: label,
            excludeSemantics: true,
            child: AppPressable(
              onTap: () => onChanged(value),
              child: AnimatedContainer(
                duration: context.reduceMotion
                    ? Duration.zero
                    : AppMotion.stateChange,
                height: AppSizes.touchTarget,
                decoration: BoxDecoration(
                  color: selected ? colors.navy : Colors.transparent,
                  borderRadius: BorderRadius.circular(AppRadii.pill),
                ),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(icon,
                        size: 18,
                        color: selected ? colors.goldLight : colors.text),
                    const SizedBox(width: AppSpacing.xs),
                    Text(
                      label,
                      style: type.bodySmall.copyWith(
                        color: selected ? Colors.white : colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        );
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.pill),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          seg(postLabel, Icons.edit_note_rounded, !news, false),
          seg(newsLabel, Icons.newspaper_rounded, news, true),
        ],
      ),
    );
  }
}

/// The qualification "field": opens the searchable picker.
class _PracticeField extends StatelessWidget {
  const _PracticeField({
    required this.label,
    required this.icon,
    required this.empty,
    required this.error,
    required this.onTap,
    this.sublabel,
  });

  final String label;
  final String? sublabel;
  final IconData icon;
  final bool empty;
  final bool error;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: [label, if (sublabel != null) sublabel!].join(', '),
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          constraints:
              const BoxConstraints(minHeight: AppSizes.touchTarget + 8),
          padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md, vertical: AppSpacing.sm),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.field),
            border: Border.all(
              color: error
                  ? colors.danger
                  : (empty ? colors.border : colors.goldStroke),
            ),
          ),
          child: Row(
            children: [
              Icon(empty ? Icons.search_rounded : icon,
                  size: 20, color: colors.goldDark),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      label,
                      style: type.body.copyWith(
                        color: empty ? colors.textSecondary : colors.text,
                        fontWeight: empty ? FontWeight.w400 : FontWeight.w600,
                      ),
                    ),
                    if (sublabel != null)
                      Text(sublabel!,
                          style: type.caption
                              .copyWith(color: colors.textSecondary)),
                  ],
                ),
              ),
              Icon(Icons.expand_more_rounded, color: colors.textSecondary),
            ],
          ),
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
