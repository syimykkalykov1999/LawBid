import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/text/tidy_text.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/feed/application/news_flag.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/presentation/create_reel_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/social/presentation/widgets/mention_suggestions.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:lawbid/features/social/presentation/widgets/post_documents.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

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
  /// Owner 2026-10-07: one field, like Threads: the first line is the
  /// post's title (bold in the feed), the rest its text.
  late final _text = TextEditingController(
    text: widget.editing == null
        ? ''
        : [
            widget.editing!.title ?? splitPostBody(widget.editing!.body).$1,
            if (widget.editing!.title != null)
              widget.editing!.body
            else
              splitPostBody(widget.editing!.body).$2,
          ].where((s) => s.trim().isNotEmpty).join('\n'),
  );

  /// The typed text as (title, body): the first line, cut at a word to
  /// [kPostTitleMaxChars]; what is cut off starts the body.
  (String, String) get _parts {
    final s = tidyText(_text.text).trim();
    final nl = s.indexOf('\n');
    var title = (nl < 0 ? s : s.substring(0, nl)).trim();
    var body = nl < 0 ? '' : s.substring(nl + 1).trim();
    if (title.length > kPostTitleMaxChars) {
      var cut = title.lastIndexOf(' ', kPostTitleMaxChars);
      if (cut <= 0) cut = kPostTitleMaxChars;
      final rest = title.substring(cut).trim();
      title = title.substring(0, cut).trim();
      body = [rest, body].where((x) => x.isNotEmpty).join('\n');
    }
    return (title, body);
  }

  final _photos = <_Photo>[];

  /// Owner 2026-10-05: PDF / Word / text readers download.
  late final _docs = PostDocumentsController(
    ref.read(socialActionsProvider),
    limits: _limits,
  )..addListener(_onDocs);

  /// Owner 2026-10-07 (bug 17): counts, MB and formats from the admin.
  late final _limits = ref.read(uploadLimitsProvider)[UploadPlace.post];
  late String? _practice = widget.editing?.practice?.code;
  late bool _pickedNews = widget.editing?.isNews ?? widget.news;

  /// Owner 2026-10-06: News is off for now — every new post is a post.
  bool get _news => _pickedNews && (_editing || ref.read(newsEnabledProvider));

  /// Owner 2026-10-05: without a topic a post is general (personal); the
  /// author can mark it legal. A topic or News makes it legal anyway.
  late bool _legal = widget.editing != null && !widget.editing!.isGeneral;

  bool get _markedLegal => _practice == null && !_news && _legal;
  bool _publishing = false;
  bool _triedPublish = false;

  bool get _editing => widget.editing != null;

  void _onDocs() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _docs.dispose();
    _text.dispose();
    super.dispose();
  }

  /// Owner 2026-10-02: Instagram-style — one gallery for photos AND videos
  /// while the owner has video switched on (flag + Bunny keys). Owner
  /// 2026-10-06: clients too (their plans include video posts); an
  /// assistant only with "publish".
  bool get _videoAllowed =>
      ref.read(reelsEnabledProvider) &&
      ref.read(canDoProvider(AssistantDuty.publish));

  static bool _isVideo(XFile f) {
    final mime = f.mimeType ?? '';
    if (mime.startsWith('video/')) return true;
    // The name, not the path: in the browser the path is a blob: URL.
    final n = f.name.toLowerCase();
    return n.endsWith('.mp4') ||
        n.endsWith('.mov') ||
        n.endsWith('.m4v') ||
        n.endsWith('.3gp') ||
        n.endsWith('.webm');
  }

  Future<void> _pick() async {
    final left = _limits.maxPhotos - _photos.length;
    if (left <= 0) return;
    final limits = postPhotoLimits(ref);
    final List<XFile> picked;
    if (_videoAllowed) {
      picked = await ImagePicker().pickMultipleMedia(
        maxWidth: limits.maxPx,
        maxHeight: limits.maxPx,
        imageQuality: limits.quality,
        limit: left,
      );
      final video = picked.where(_isVideo).firstOrNull;
      if (video != null) {
        if (!mounted) return;
        // A reel carries one video and no photos: the picked ones would go.
        if (_photos.isNotEmpty) {
          final t = ref.read(translatorProvider);
          final ok = await showConfirmSheet(
            context,
            t: t,
            title: t.t('post.toReel.title'),
            message: t.t('post.toReel.message'),
            confirmLabel: t.t('post.toReel.confirm'),
          );
          if (!ok || !mounted) return;
        }
        // A video makes it a reel: the reel screen takes it from here,
        // keeping the typed title and text.
        await Navigator.of(context).pushReplacement(
          MaterialPageRoute<void>(
            builder: (_) => CreateReelScreen(
              initialFile: video,
              initialTitle: _parts.$1,
              initialText: _parts.$2,
            ),
          ),
        );
        return;
      }
    } else {
      picked = await ImagePicker().pickMultiImage(
        maxWidth: limits.maxPx,
        maxHeight: limits.maxPx,
        imageQuality: limits.quality,
        limit: left,
      );
    }
    for (final file in picked.take(left)) {
      final photo = _Photo(await file.readAsBytes());
      if (!mounted) return;
      setState(() => _photos.add(photo));
      // ignore: unawaited_futures
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
    // ignore: unawaited_futures
    HapticFeedback.selectionClick();
    setState(() => _practice = picked.first);
  }

  bool get _ready =>
      _parts.$1.isNotEmpty &&
      _photos.every((p) => p.fileId != null) &&
      _docs.ready;

  Future<void> _publish() async {
    final t = ref.read(translatorProvider);
    setState(() => _triedPublish = true);
    if (_publishing || !_ready) return;
    setState(() => _publishing = true);
    try {
      if (_editing) {
        final error = await ref.read(socialActionsProvider).editPost(
              widget.editing!,
              title: _parts.$1,
              body: _parts.$2,
              practiceCode: _practice,
              markedLegal: _practice == null ? _legal : null,
            );
        // ignore: only_throw_errors
        if (error != null) throw error;
        if (!mounted) return;
        Navigator.of(context).pop();
        return;
      }
      // OQ-048: an assistant's post goes to the attorney for approval.
      if (ref.read(isAssistantProvider) &&
          !ref.read(canDoProvider(AssistantDuty.publish))) {
        await ref.read(teamRepositoryProvider).createRequest(
          RequestKind.post,
          {
            'title': _parts.$1,
            'body': _parts.$2,
            if (_practice != null) 'practiceCode': _practice,
            'kind': _news ? 'news' : 'post',
            if (_markedLegal) 'contentClass': 'legal',
            'mediaFileIds': [for (final p in _photos) p.fileId!],
            if (_docs.items.isNotEmpty)
              'attachments': [
                for (final d in _docs.refs)
                  {'fileId': d.fileId, 'fileName': d.fileName},
              ],
          },
        );
        if (!mounted) return;
        // ignore: unawaited_futures
        HapticFeedback.mediumImpact();
        showAppSnackBar(context, t.t('request.sent'));
        Navigator.of(context).pop();
        return;
      }
      final post = await ref.read(socialRepositoryProvider).createPost(
            PostDraft(
              title: _parts.$1,
              body: _parts.$2,
              practiceCode: _practice,
              isNews: _news,
              markedLegal: _markedLegal,
              mediaFileIds: [for (final p in _photos) p.fileId!],
              attachments: _docs.refs,
            ),
          );
      if (!mounted) return;
      ref.read(feedProvider.notifier).prepend(post);
      // The author's profile grids and post counters follow at once.
      ref
        ..invalidate(attorneyPostsProvider(post.author.id))
        ..invalidate(attorneyNewsProvider(post.author.id))
        ..invalidate(publicAttorneyProfileProvider)
        ..invalidate(publicClientProfileProvider);
      // ignore: unawaited_futures
      HapticFeedback.mediumImpact();
      showAppSnackBar(
        context,
        t.t(_news ? 'post.news.published' : 'post.published'),
      );
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
    // Owner 2026-10-06: the Post | News switch only while News is on.
    final attorney =
        ref.watch(actsAsAttorneyProvider) && ref.watch(newsEnabledProvider);
    final video = ref.watch(reelsEnabledProvider) &&
        ref.watch(canDoProvider(AssistantDuty.publish));
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
          icon: const AppIcon(AppIcons.closeRounded),
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          t.t(
            _editing
                ? 'post.menu.edit'
                : (_news ? 'post.news.create' : 'post.create.title'),
          ),
        ),
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
                      onChanged: (v) => setState(() => _pickedNews = v),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      t.t(_news ? 'post.kind.newsHint' : 'post.kind.postHint'),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  // Owner 2026-10-01: the qualification is optional.
                  label(t.t('post.create.practice')),
                  _PracticeField(
                    label: practice == null
                        ? t.t('post.create.practicePick')
                        : practiceLabel(ref, practice),
                    sublabel: practice == null || isPracticeCategory(practice)
                        ? null
                        : practiceLabel(ref, practiceCategoryOf(practice)),
                    icon: practiceGlyph(
                      practice == null ? null : practiceCategoryOf(practice),
                    ),
                    empty: practice == null,
                    error: false,
                    onTap: _pickPractice,
                  ),
                  // Owner 2026-10-05: no topic = a general (personal) post
                  // unless the author says it is about law.
                  if (practice == null && !_news) ...[
                    const SizedBox(height: AppSpacing.sm),
                    MergeSemantics(
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  t.t('post.create.legal'),
                                  style: type.body,
                                ),
                                const SizedBox(height: AppSpacing.xs),
                                Text(
                                  t.t('post.create.legalHint'),
                                  style: type.caption
                                      .copyWith(color: colors.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Switch.adaptive(
                            key: const ValueKey('post-legal-switch'),
                            value: _legal,
                            activeTrackColor: colors.gold,
                            onChanged: (v) => setState(() => _legal = v),
                          ),
                        ],
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  PostTextField(
                    controller: _text,
                    hint: t.t('post.create.oneFieldHint'),
                  ),
                  ValueListenableBuilder<TextEditingValue>(
                    valueListenable: _text,
                    builder: (context, _, __) => missing && _parts.$1.isEmpty
                        ? Padding(
                            padding: const EdgeInsets.only(top: AppSpacing.xs),
                            child: Text(
                              t.t('post.create.required'),
                              style:
                                  type.caption.copyWith(color: colors.danger),
                            ),
                          )
                        : const SizedBox.shrink(),
                  ),
                  // OQ-042: "@…" suggests people to mention.
                  MentionSuggestions(controller: _text),
                  const SizedBox(height: AppSpacing.lg),
                  if (!_editing) ...[
                    Row(
                      children: [
                        // Owner 2026-10-06: one section for photos and
                        // videos (reels).
                        Expanded(
                          child: Text(
                            t.t(
                              video
                                  ? 'post.create.media'
                                  : 'post.create.photos',
                            ),
                            style: type.titleMedium,
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Text(
                          '${_photos.length} / ${_limits.maxPhotos}',
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
                        // ignore: deprecated_member_use
                        onReorder: (from, to) => setState(() {
                          final p = _photos.removeAt(from);
                          _photos.insert(to > from ? to - 1 : to, p);
                        }),
                        footer: _photos.length < _limits.maxPhotos
                            ? _AddPhotoTile(
                                label: t.t(
                                  video
                                      ? 'post.create.addMedia'
                                      : 'post.create.addPhoto',
                                ),
                                video: video,
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
                      t.t(
                        _photos.length > 1
                            ? 'post.create.reorderHint'
                            : (video
                                ? 'post.create.mediaHint'
                                : 'post.create.photosHint'),
                      ),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                    // Without photos: a preview of the art the card gets.
                    if (_photos.isEmpty && practice != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      Text(
                        t.t('post.create.defaultCover'),
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
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
                    const SizedBox(height: AppSpacing.lg),
                    PostDocumentsEditor(
                      controller: _docs,
                      enabled: !_publishing,
                    ),
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
                  label: t.t(
                    _editing
                        ? 'common.save'
                        : ref.watch(isAssistantProvider) &&
                                !ref.watch(
                                  canDoProvider(AssistantDuty.publish),
                                )
                            ? 'request.sendForApproval'
                            : (_news
                                ? 'post.news.publish'
                                : 'post.create.publish'),
                  ),
                  icon: _editing ? AppIcons.checkRounded : AppIcons.sendRounded,
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
    // ignore: avoid_positional_boolean_parameters
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
                    AppIcon(
                      icon,
                      size: 18,
                      color: selected ? colors.goldLight : colors.text,
                    ),
                    const SizedBox(width: AppSpacing.xs),
                    Flexible(
                      child: Text(
                        label,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(
                          color: selected ? Colors.white : colors.text,
                          fontWeight: FontWeight.w600,
                        ),
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
          seg(postLabel, AppIcons.editNoteRounded, !news, false),
          seg(newsLabel, AppIcons.newspaperRounded, news, true),
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
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
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
              AppIcon(
                empty ? AppIcons.searchRounded : icon,
                size: 20,
                color: colors.goldDark,
              ),
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
                      Text(
                        sublabel!,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                  ],
                ),
              ),
              AppIcon(AppIcons.expandMoreRounded, color: colors.textSecondary),
            ],
          ),
        ),
      ),
    );
  }
}

class _AddPhotoTile extends StatelessWidget {
  const _AddPhotoTile({
    required this.label,
    required this.onTap,
    this.video = false,
  });

  final String label;
  final VoidCallback onTap;

  /// Photos and videos: the gallery glyph instead of the photo one.
  final bool video;

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
          margin: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
          decoration: BoxDecoration(
            color: colors.goldTint,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.goldStroke),
          ),
          child: AppIcon(
            video
                ? AppIcons.photoLibraryOutlined
                : AppIcons.addPhotoAlternateOutlined,
            color: colors.goldDark,
            size: AppSizes.iconLg,
          ),
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
      margin: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
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
                    icon: const AppIcon(
                      AppIcons.refreshRounded,
                      color: Colors.white,
                    ),
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
                child: Text(
                  '${index + 1}',
                  style: type.caption.copyWith(color: Colors.white),
                ),
              ),
            ),
            Positioned(
              right: 0,
              top: 0,
              child: AppIconButton(
                icon:
                    const AppIcon(AppIcons.cancelRounded, color: Colors.white),
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
