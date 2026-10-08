import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/video_frames.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/text/tidy_text.dart';
import 'package:lawbid/features/reels/application/reel_publish.dart';
import 'package:lawbid/features/reels/presentation/reel_preview.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/presentation/widgets/mention_suggestions.dart';
import 'package:lawbid/features/social/presentation/widgets/post_documents.dart';
import 'package:lawbid/features/social/presentation/widgets/tag_text_controller.dart';
import 'package:lawbid/features/uploads/application/composer_photo.dart';
import 'package:lawbid/features/uploads/application/upload_queue.dart';

/// Owner 2026-10-01 — "+" → Reel: pick or record a vertical video, add a
/// title and a caption, publish; the reel appears in the feeds once Bunny
/// has encoded it.
///
/// Owner 2026-10-08: the video is pinned on top (no trimming: a video
/// longer than `video.max_duration_sec` is refused with a clear message);
/// the cover is a frame from a row under it or a photo «Из галереи», shown
/// large in the video window; one field — the title, a line, the
/// description with #hashtags and @mentions; then the place, comments and
/// what opens «Внутри рилса». «Опубликовать» stays grey until it can go
/// (a tap says what is missing) and closes the screen at once — the reel
/// uploads in the strip at the top of the feed.
class CreateReelScreen extends ConsumerStatefulWidget {
  const CreateReelScreen({
    this.initialFile,
    this.initialTitle = '',
    this.initialText = '',
    super.key,
  });

  /// A video already chosen in the post's gallery picker.
  final XFile? initialFile;

  /// The title and text already typed on the post screen.
  final String initialTitle;
  final String initialText;

  @override
  ConsumerState<CreateReelScreen> createState() => _CreateReelScreenState();
}

/// The server's `video.max_duration_sec` default; the live value comes
/// from the admin panel (bootstrap app_config).
const _kDefaultMaxSeconds = 90;

/// Whether a [durationMs] video is too long for a reel of [maxSeconds]
/// (rounded as the server checks it).
bool reelTooLong(int durationMs, int maxSeconds) =>
    (durationMs / 1000).round() > maxSeconds;

class _CreateReelScreenState extends ConsumerState<CreateReelScreen> {
  late final _title = TextEditingController(text: widget.initialTitle);
  late final _text = TagTextController(text: widget.initialText);
  final _textFocus = FocusNode();
  final _place = TextEditingController();
  bool _comments = true;
  XFile? _file;
  ReelPreview? _preview;

  /// The cover row: moments of the video and their frames (null while
  /// loading or when the phone cannot make one).
  List<int> _frameTimes = const [];
  List<Uint8List?> _frames = const [];
  int _coverIndex = 0;

  /// «Из галереи»: a photo instead of a frame.
  ComposerPhoto? _coverPhoto;

  /// Bumped per picked video: late frames of an old one are dropped.
  int _generation = 0;
  final _photos = <ComposerPhoto>[];
  late final _docs = PostDocumentsController(
    ref.read(socialActionsProvider),
    limits: _limits,
  )..addListener(_refresh);

  /// Owner 2026-10-07 (bug 17): counts, MB and formats from the admin.
  late final _limits = ref.read(uploadLimitsProvider)[UploadPlace.reel];

  @override
  void initState() {
    super.initState();
    _title.addListener(_refresh);
    _text.addListener(_refresh);
    // A video already chosen in the post's gallery picker: load it now.
    final first = widget.initialFile;
    if (first != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _load(first));
    }
  }

  void _refresh() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    _preview?.changes.removeListener(_refresh);
    _preview?.dispose();
    for (final p in [..._photos, if (_coverPhoto != null) _coverPhoto!]) {
      p.removeListener(_refresh);
    }
    _docs.dispose();
    _title.dispose();
    _text.dispose();
    _textFocus.dispose();
    _place.dispose();
    super.dispose();
  }

  int get _maxSeconds => ref
      .read(featureFlagsControllerProvider)
      .configInt('video.max_duration_sec', _kDefaultMaxSeconds);

  Future<void> _pick(ImageSource source) async {
    final x = await ImagePicker().pickVideo(
      source: source,
      maxDuration: Duration(seconds: _maxSeconds),
    );
    if (x == null) return;
    await _load(x);
  }

  Future<void> _load(XFile file) async {
    final t = ref.read(translatorProvider);
    final preview = await ref.read(reelPreviewLoaderProvider)(file);
    if (!mounted) {
      await preview?.dispose();
      return;
    }
    final ms = preview?.durationMs ?? 0;
    if (preview == null || ms <= 0) {
      await preview?.dispose();
      if (mounted) showAppSnackBar(context, t.t('reels.badFile'));
      return;
    }
    // Owner 2026-10-08: no trimming — a longer video is refused.
    if (reelTooLong(ms, _maxSeconds)) {
      await preview.dispose();
      if (mounted) {
        showAppSnackBar(
          context,
          t.t('reels.tooLong.max', {
            'max': '$_maxSeconds',
            'length': formatReelDuration((ms / 1000).round()),
          }),
        );
      }
      return;
    }
    final old = _preview;
    old?.changes.removeListener(_refresh);
    await old?.dispose();
    if (!mounted) {
      await preview.dispose();
      return;
    }
    preview.changes.addListener(_refresh);
    final times = coverFrameTimes(ms);
    final gen = ++_generation;
    setState(() {
      _file = file;
      _preview = preview;
      _frameTimes = times;
      _frames = List<Uint8List?>.filled(times.length, null);
      _coverIndex = 0;
    });
    final frames = ref.read(videoFramesProvider);
    for (var i = 0; i < times.length; i++) {
      final bytes = await frames(file, times[i]);
      if (!mounted || gen != _generation) return;
      if (bytes != null) setState(() => _frames[i] = bytes);
    }
  }

  void _pickFrame(int i) {
    final old = _coverPhoto;
    old?.removeListener(_refresh);
    setState(() {
      _coverIndex = i;
      _coverPhoto = null;
    });
    final c = _preview;
    if (c != null && i < _frameTimes.length) {
      c
        ..pause()
        ..seekTo(_frameTimes[i]);
    }
  }

  Future<void> _pickCoverPhoto() async {
    final limits = postPhotoLimits(ref);
    final x = await ImagePicker().pickImage(
      source: ImageSource.gallery,
      maxWidth: limits.maxPx,
      maxHeight: limits.maxPx,
      imageQuality: limits.quality,
    );
    if (x == null) return;
    final photo = ComposerPhoto(await x.readAsBytes());
    if (!mounted) return;
    _coverPhoto?.removeListener(_refresh);
    photo.addListener(_refresh);
    setState(() => _coverPhoto = photo);
    await _preview?.pause();
    photo.upload(ref.read(socialActionsProvider)).ignore();
  }

  void _togglePreview() {
    final c = _preview;
    if (c == null) return;
    c.playing ? c.pause() : c.play();
  }

  Future<void> _pickPhotos() async {
    final left = _limits.maxPhotos - _photos.length;
    if (left <= 0) return;
    final limits = postPhotoLimits(ref);
    final picked = await ImagePicker().pickMultiImage(
      maxWidth: limits.maxPx,
      maxHeight: limits.maxPx,
      imageQuality: limits.quality,
      limit: left,
    );
    for (final f in picked.take(left)) {
      final photo = ComposerPhoto(await f.readAsBytes());
      if (!mounted) return;
      photo.addListener(_refresh);
      setState(() => _photos.add(photo));
      photo.upload(ref.read(socialActionsProvider)).ignore();
    }
  }

  String get _titleText => tidyText(_title.text).trim();
  String get _bodyText => tidyText(_text.text).trim();

  /// What is still missing, as the `reels.need.*` hint; null = ready.
  String? get _missing {
    if (_file == null || _preview == null) return 'reels.need.video';
    if (_titleText.isEmpty && _bodyText.isEmpty) return 'reels.need.text';
    if (!_docs.ready) return 'reels.need.files';
    return null;
  }

  Uint8List? get _coverBytes =>
      _coverPhoto?.bytes ??
      (_coverIndex < _frames.length ? _frames[_coverIndex] : null);

  void _publish() {
    final file = _file;
    final preview = _preview;
    if (_missing != null || file == null || preview == null) return;
    final draft = ReelDraft(
      file: file,
      durationMs: preview.durationMs,
      size: preview.size,
      coverMs: _coverIndex < _frameTimes.length ? _frameTimes[_coverIndex] : 0,
      coverPhoto: _coverPhoto,
      photos: List.of(_photos),
      documents: _docs.refs,
      title: _titleText.characters.take(kPostTitleMaxChars).toString(),
      body: _bodyText,
      place: _place.text.trim().isEmpty ? null : _place.text.trim(),
      commentsEnabled: _comments,
    );
    ref.read(uploadQueueProvider.notifier).add(
          (ref, progress) => publishReel(ref, draft, progress),
          thumbnail: _coverBytes,
          video: true,
        );
    // ignore: unawaited_futures
    HapticFeedback.mediumImpact();
    // Owner 2026-10-08: the composer closes at once; the strip on top of
    // the feed shows the upload.
    final router = GoRouter.maybeOf(context);
    Navigator.of(context).pop();
    router?.go(AppRoutes.feed);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final missing = _missing;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const AppIcon(AppIcons.closeRounded),
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(t.t('reels.create')),
      ),
      body: SafeArea(
        child: Column(
          children: [
            // Owner 2026-10-08: the video stays on top while the form
            // scrolls under it.
            Padding(
              padding: const EdgeInsets.only(
                top: AppSpacing.sm,
                bottom: AppSpacing.md,
              ),
              child: _VideoWindow(
                preview: _preview,
                cover: _coverBytes,
                galleryLabel: t.t('reels.pick.gallery'),
                cameraLabel: t.t('reels.pick.camera'),
                onGallery: () => _pick(ImageSource.gallery),
                onCamera: () => _pick(ImageSource.camera),
                onTap: _togglePreview,
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  0,
                  AppSpacing.screenSide,
                  AppSpacing.screenSide,
                ),
                children: [
                  if (_preview != null) ...[
                    _CoverRow(
                      frames: _frames,
                      times: _frameTimes,
                      selected: _coverPhoto == null ? _coverIndex : null,
                      photo: _coverPhoto,
                      galleryLabel: t.t('reels.pick.gallery'),
                      frameLabel: (ms) => t.t(
                        'reels.cover.frame',
                        {'time': formatReelDuration((ms / 1000).round())},
                      ),
                      onFrame: _pickFrame,
                      onGallery: _pickCoverPhoto,
                    ),
                    const SizedBox(height: AppSpacing.lg),
                  ],
                  _OneField(
                    title: _title,
                    text: _text,
                    textFocus: _textFocus,
                    titleHint: t.t('reels.titleHint'),
                    textHint: t.t('reels.captionHint'),
                    titleLabel: t.t('post.create.titleField'),
                    textLabel: t.t('post.create.bodyField'),
                  ),
                  // OQ-042: "@…" suggests people to tag.
                  MentionSuggestions(controller: _text),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    controller: _place,
                    hintText: t.t('reels.location'),
                    semanticLabel: t.t('reels.locationHint'),
                    maxLength: 120,
                    textCapitalization: TextCapitalization.words,
                  ),
                  SwitchListTile.adaptive(
                    contentPadding: EdgeInsets.zero,
                    value: _comments,
                    activeTrackColor: colors.gold,
                    onChanged: (v) => setState(() => _comments = v),
                    title: Text(
                      t.t('reels.commentsOn'),
                      style: type.body.copyWith(color: colors.text),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  ..._insideSection(t, colors, type),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: AppButton(
                key: const ValueKey('reel-publish'),
                label: t.t('reels.publish'),
                icon: AppIcons.sendRounded,
                // Owner 2026-10-07: say what is missing.
                disabledHint: missing == null ? null : t.t(missing),
                isEnabled: missing == null,
                onPressed: _publish,
              ),
            ),
          ],
        ),
      ),
    );
  }

  /// Owner 2026-10-05: what opens with "Смотреть" under the reel.
  List<Widget> _insideSection(
    Translator t,
    AppColorTokens colors,
    AppTypographyTokens type,
  ) =>
      [
        Row(
          children: [
            AppIcon(
              AppIcons.bookOpenTextOutlined,
              size: 20,
              color: colors.text,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(t.t('reels.inside.title'), style: type.titleMedium),
            ),
            Text(
              '${_photos.length} / ${_limits.maxPhotos}',
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ],
        ),
        const SizedBox(height: AppSpacing.sm),
        SizedBox(
          height: 80,
          child: ListView(
            scrollDirection: Axis.horizontal,
            children: [
              for (final p in _photos)
                Padding(
                  key: p.key,
                  padding: const EdgeInsetsDirectional.only(end: AppSpacing.sm),
                  child: _InsidePhoto(
                    photo: p,
                    removeLabel: t.t('post.create.removePhoto'),
                    retryLabel: t.t('error.retry'),
                    onRemove: () => setState(() {
                      p.removeListener(_refresh);
                      _photos.remove(p);
                    }),
                    onRetry: () =>
                        p.upload(ref.read(socialActionsProvider)).ignore(),
                  ),
                ),
              if (_photos.length < _limits.maxPhotos)
                Semantics(
                  button: true,
                  label: t.t('reels.inside.addPhoto'),
                  excludeSemantics: true,
                  child: AppPressable(
                    onTap: _pickPhotos,
                    child: Container(
                      width: 80,
                      decoration: BoxDecoration(
                        color: colors.surface,
                        borderRadius: BorderRadius.circular(AppRadii.field),
                        border: Border.all(color: colors.border),
                      ),
                      child: Center(
                        child: AppIcon(
                          AppIcons.addPhotoAlternateOutlined,
                          color: colors.goldDark,
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        PostDocumentsEditor(controller: _docs),
      ];
}

/// The 9:16 window on top: the picked video, or the chosen cover large
/// while it is not playing; before a video, the two ways to get one.
class _VideoWindow extends StatelessWidget {
  const _VideoWindow({
    required this.preview,
    required this.cover,
    required this.galleryLabel,
    required this.cameraLabel,
    required this.onGallery,
    required this.onCamera,
    required this.onTap,
  });

  final ReelPreview? preview;
  final Uint8List? cover;
  final String galleryLabel;
  final String cameraLabel;
  final VoidCallback onGallery;
  final VoidCallback onCamera;
  final VoidCallback onTap;

  static const height = 260.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = preview;

    Widget source(IconData icon, String label, VoidCallback onTap) =>
        AppIconButton(
          icon: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: c == null ? colors.goldTint : Colors.black45,
              shape: BoxShape.circle,
              border: c == null ? Border.all(color: colors.goldStroke) : null,
            ),
            child: Center(
              child: AppIcon(
                icon,
                size: 20,
                color: c == null ? colors.goldDark : Colors.white,
              ),
            ),
          ),
          semanticLabel: label,
          onPressed: onTap,
        );

    final sources = Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        source(AppIcons.photoLibraryOutlined, galleryLabel, onGallery),
        source(AppIcons.videoCameraOutlined, cameraLabel, onCamera),
      ],
    );

    return Center(
      child: ClipRRect(
        borderRadius: BorderRadius.circular(AppRadii.card),
        child: SizedBox(
          width: height * 9 / 16,
          height: height,
          child: c == null
              ? ColoredBox(
                  color: colors.surface,
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AppIcon(
                        AppIcons.filmReelOutlined,
                        size: 40,
                        color: colors.textSecondary,
                      ),
                      const SizedBox(height: AppSpacing.md),
                      sources,
                    ],
                  ),
                )
              : Stack(
                  fit: StackFit.expand,
                  children: [
                    GestureDetector(onTap: onTap, child: c.view()),
                    if (!c.playing && cover != null)
                      IgnorePointer(
                        child: Image.memory(cover!, fit: BoxFit.cover),
                      ),
                    if (!c.playing)
                      const IgnorePointer(
                        child: Center(
                          child: AppIcon(
                            AppIcons.playArrowRounded,
                            size: 44,
                            color: Colors.white70,
                          ),
                        ),
                      ),
                    PositionedDirectional(
                      top: 0,
                      end: 0,
                      child: sources,
                    ),
                    PositionedDirectional(
                      end: AppSpacing.sm,
                      bottom: AppSpacing.sm,
                      child: Text(
                        formatReelDuration((c.durationMs / 1000).round()),
                        style: type.caption.copyWith(
                          color: Colors.white,
                          shadows: const [Shadow(blurRadius: 6)],
                        ),
                      ),
                    ),
                  ],
                ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-08: the cover — «Из галереи» or one of the frames.
class _CoverRow extends StatelessWidget {
  const _CoverRow({
    required this.frames,
    required this.times,
    required this.selected,
    required this.photo,
    required this.galleryLabel,
    required this.frameLabel,
    required this.onFrame,
    required this.onGallery,
  });

  final List<Uint8List?> frames;
  final List<int> times;

  /// The chosen frame; null = the gallery photo is the cover.
  final int? selected;
  final ComposerPhoto? photo;
  final String galleryLabel;
  final String Function(int ms) frameLabel;
  final ValueChanged<int> onFrame;
  final VoidCallback onGallery;

  static const _w = 40.0;
  static const _h = 64.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;

    Widget tile({
      required bool on,
      required Widget child,
      double width = _w,
    }) =>
        AnimatedContainer(
          duration:
              context.reduceMotion ? Duration.zero : AppMotion.stateChange,
          width: width,
          height: _h,
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.field),
            border: Border.all(
              color: on ? colors.gold : colors.border,
              width: on ? 2 : 1,
            ),
          ),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.field - 1),
            child: child,
          ),
        );

    final cover = photo;
    return SizedBox(
      height: _h,
      child: ListView(
        scrollDirection: Axis.horizontal,
        children: [
          Semantics(
            button: true,
            selected: cover != null,
            label: galleryLabel,
            excludeSemantics: true,
            child: AppPressable(
              onTap: onGallery,
              child: tile(
                on: cover != null,
                width: 72,
                child: cover != null
                    ? Stack(
                        fit: StackFit.expand,
                        children: [
                          Image.memory(
                            cover.bytes,
                            fit: BoxFit.cover,
                            cacheWidth: 216,
                          ),
                          if (cover.error != null)
                            const ColoredBox(
                              color: Colors.black45,
                              child: Center(
                                child: AppIcon(
                                  AppIcons.refreshRounded,
                                  color: Colors.white,
                                ),
                              ),
                            ),
                        ],
                      )
                    : Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          AppIcon(
                            AppIcons.addPhotoAlternateOutlined,
                            size: 20,
                            color: colors.goldDark,
                          ),
                          const SizedBox(height: 2),
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: 2),
                            child: FitText(
                              galleryLabel,
                              textAlign: TextAlign.center,
                              style: type.caption.copyWith(color: colors.text),
                            ),
                          ),
                        ],
                      ),
              ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          for (var i = 0; i < times.length; i++)
            Padding(
              padding: const EdgeInsetsDirectional.only(end: 4),
              child: Semantics(
                button: true,
                selected: selected == i,
                label: frameLabel(times[i]),
                excludeSemantics: true,
                child: AppPressable(
                  key: ValueKey('reel-cover-frame-$i'),
                  onTap: () => onFrame(i),
                  child: tile(
                    on: selected == i,
                    child: i < frames.length && frames[i] != null
                        ? Image.memory(
                            frames[i]!,
                            fit: BoxFit.cover,
                            cacheWidth: 120,
                          )
                        : const SizedBox.expand(),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Owner 2026-10-08: one field — the title on top, a line, then the
/// description (#hashtags and @mentions in gold).
class _OneField extends StatelessWidget {
  const _OneField({
    required this.title,
    required this.text,
    required this.textFocus,
    required this.titleHint,
    required this.textHint,
    required this.titleLabel,
    required this.textLabel,
  });

  final TextEditingController title;
  final TextEditingController text;
  final FocusNode textFocus;
  final String titleHint;
  final String textHint;
  final String titleLabel;
  final String textLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    InputDecoration bare(String hint) => InputDecoration(
          hintText: hint,
          hintStyle: type.body.copyWith(color: colors.textSecondary),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          isDense: true,
          contentPadding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.md,
          ),
        );
    Widget? noCounter(
      BuildContext _, {
      required int currentLength,
      required bool isFocused,
      int? maxLength,
    }) =>
        null;

    return Container(
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        children: [
          Semantics(
            label: titleLabel,
            textField: true,
            child: TextField(
              key: const ValueKey('reel-title'),
              controller: title,
              onTapOutside: hideKeyboardOnTapOutside,
              maxLength: kPostTitleMaxChars,
              maxLengthEnforcement: MaxLengthEnforcement.enforced,
              buildCounter: noCounter,
              textCapitalization: TextCapitalization.sentences,
              textInputAction: TextInputAction.next,
              onSubmitted: (_) => textFocus.requestFocus(),
              style: type.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w700,
              ),
              decoration: bare(titleHint),
            ),
          ),
          Divider(height: 1, thickness: 1, color: colors.border),
          Semantics(
            label: textLabel,
            textField: true,
            child: TextField(
              key: const ValueKey('reel-text'),
              controller: text,
              focusNode: textFocus,
              onTapOutside: hideKeyboardOnTapOutside,
              minLines: 3,
              maxLines: 8,
              maxLength: kPostMaxChars,
              maxLengthEnforcement: MaxLengthEnforcement.enforced,
              buildCounter: noCounter,
              textCapitalization: TextCapitalization.sentences,
              style: type.body.copyWith(color: colors.text),
              decoration: bare(textHint),
            ),
          ),
        ],
      ),
    );
  }
}

class _InsidePhoto extends StatelessWidget {
  const _InsidePhoto({
    required this.photo,
    required this.removeLabel,
    required this.retryLabel,
    required this.onRemove,
    required this.onRetry,
  });

  final ComposerPhoto photo;
  final String removeLabel;
  final String retryLabel;
  final VoidCallback? onRemove;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SizedBox.square(
      dimension: 80,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.field),
            child: Image.memory(photo.bytes, fit: BoxFit.cover),
          ),
          if (photo.uploading)
            ColoredBox(
              color: Colors.black38,
              child: Center(
                child: SizedBox.square(
                  dimension: 24,
                  child: CircularProgressIndicator(
                    value: photo.progress > 0 ? photo.progress : null,
                    strokeWidth: 2,
                    color: Colors.white,
                  ),
                ),
              ),
            ),
          if (photo.error != null)
            Semantics(
              button: true,
              label: retryLabel,
              excludeSemantics: true,
              child: GestureDetector(
                onTap: onRetry,
                child: ColoredBox(
                  color: Colors.black54,
                  child: Center(
                    child: AppIcon(
                      AppIcons.refreshRounded,
                      color: colors.danger,
                    ),
                  ),
                ),
              ),
            ),
          PositionedDirectional(
            top: 2,
            end: 2,
            child: Semantics(
              button: true,
              label: removeLabel,
              excludeSemantics: true,
              child: GestureDetector(
                onTap: onRemove,
                child: Container(
                  width: 24,
                  height: 24,
                  decoration: const BoxDecoration(
                    color: Colors.black54,
                    shape: BoxShape.circle,
                  ),
                  child: const Center(
                    child: AppIcon(
                      AppIcons.closeRounded,
                      size: 14,
                      color: Colors.white,
                    ),
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
