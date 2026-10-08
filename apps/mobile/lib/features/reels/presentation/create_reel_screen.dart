import 'dart:io';
import 'dart:math' as math;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/media/video_compression.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/domain/reel_cut.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';
import 'package:lawbid/features/social/presentation/widgets/mention_suggestions.dart';
import 'package:lawbid/features/social/presentation/widgets/post_documents.dart';
import 'package:video_player/video_player.dart';

/// Owner 2026-10-01 — "+" → Reel: pick or record a vertical video, add a
/// title and a caption, publish. The file goes straight to Bunny (with a
/// progress bar, resumable); the reel appears in the feeds once Bunny has
/// encoded it — the author gets a notification.
///
/// Owner 2026-10-05: like Instagram — a longer video (up to
/// `video.max_source_duration_sec`) is cut to the part the reel plays (≤
/// `video.max_duration_sec`), the author picks the cover frame, and adds
/// what opens with "Смотреть" under the reel: up to 9 photos and up to 9
/// documents (PDF, Word, text).
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

/// `video.max_source_duration_sec`: the longest video a reel is cut from.
const _kDefaultSourceSeconds = 180;

/// A photo of the reel's inner page, uploaded right after it is picked.
class _Photo {
  _Photo(this.bytes);

  final Uint8List bytes;
  final key = UniqueKey();
  double progress = 0;
  String? fileId;
  Object? error;

  bool get uploading => fileId == null && error == null;
}

class _CreateReelScreenState extends ConsumerState<CreateReelScreen> {
  late final _title = TextEditingController(text: widget.initialTitle);
  late final _text = TextEditingController(text: widget.initialText);
  final _place = TextEditingController();
  bool _comments = true;
  XFile? _file;
  VideoPlayerController? _preview;
  ReelCut? _cut;

  /// The preview stands on the cover frame while it is being chosen.
  bool _choosingCover = false;
  final _photos = <_Photo>[];
  late final _docs = PostDocumentsController(
    ref.read(socialActionsProvider),
    limits: _limits,
  )..addListener(_refresh);

  /// Owner 2026-10-07 (bug 17): counts, MB and formats from the admin.
  late final _limits = ref.read(uploadLimitsProvider)[UploadPlace.reel];
  double? _progress;

  /// Owner 2026-10-05: true while the video is re-encoded on the phone.
  bool _compressing = false;
  VideoCompressor? _compressor;
  bool _publishing = false;
  CancelToken? _cancel;
  String? _assetId;

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
    _cancel?.cancel();
    if (_compressing) _compressor?.cancel().ignore();
    _preview?.removeListener(_loopInCut);
    _preview?.dispose();
    _docs.dispose();
    _title.dispose();
    _text.dispose();
    _place.dispose();
    super.dispose();
  }

  int get _kMaxSeconds => ref
      .read(featureFlagsControllerProvider)
      .configInt('video.max_duration_sec', _kDefaultMaxSeconds);

  int get _kSourceSeconds => ref
      .read(featureFlagsControllerProvider)
      .configInt('video.max_source_duration_sec', _kDefaultSourceSeconds)
      .clamp(_kMaxSeconds, 3600);

  Future<void> _pick(ImageSource source) async {
    final x = await ImagePicker().pickVideo(
      source: source,
      // Recording stops at the reel's length; from the gallery a longer
      // video is cut below.
      maxDuration: Duration(seconds: _kMaxSeconds),
    );
    if (x == null) return;
    await _load(x);
  }

  Future<void> _load(XFile file) async {
    final t = ref.read(translatorProvider);
    // In the browser the picked video is a blob: URL, played as a network
    // source (video_player_web has no files).
    final c = kIsWeb
        ? VideoPlayerController.networkUrl(Uri.parse(file.path))
        : VideoPlayerController.file(File(file.path));
    try {
      await c.initialize();
    } on Object {
      await c.dispose();
      if (mounted) showAppSnackBar(context, t.t('reels.badFile'));
      return;
    }
    final totalMs = c.value.duration.inMilliseconds;
    if (totalMs <= 0 || (totalMs / 1000).ceil() > _kSourceSeconds) {
      await c.dispose();
      if (mounted) {
        showAppSnackBar(
          context,
          t.t(
            totalMs <= 0 ? 'reels.badFile' : 'reels.tooLong',
            {'max': '$_kSourceSeconds'},
          ),
        );
      }
      return;
    }
    await c.setLooping(true);
    await c.setVolume(0);
    await c.play();
    final old = _preview;
    old?.removeListener(_loopInCut);
    await old?.dispose();
    if (!mounted) {
      await c.dispose();
      return;
    }
    c.addListener(_loopInCut);
    setState(() {
      _file = file;
      _preview = c;
      _cut = ReelCut.initial(totalMs, _kMaxSeconds * 1000);
      _choosingCover = false;
    });
  }

  /// The preview plays only the chosen part, round and round.
  void _loopInCut() {
    final c = _preview;
    final cut = _cut;
    if (c == null || cut == null || _choosingCover || !c.value.isPlaying) {
      return;
    }
    final pos = c.value.position.inMilliseconds;
    if (pos >= cut.endMs || pos < cut.startMs - 250) {
      c.seekTo(Duration(milliseconds: cut.startMs));
    }
  }

  void _setRange(RangeValues v) {
    final cut = _cut;
    if (cut == null) return;
    final next = cut.withRange(
      (v.start * 1000).round(),
      (v.end * 1000).round(),
      _kMaxSeconds * 1000,
    );
    final startMoved = next.startMs != cut.startMs;
    setState(() {
      _cut = next;
      _choosingCover = false;
    });
    final c = _preview;
    if (c == null) return;
    c.seekTo(
      Duration(milliseconds: startMoved ? next.startMs : next.endMs - 300),
    );
    if (!c.value.isPlaying) c.play();
  }

  void _setCover(double seconds) {
    final cut = _cut;
    final c = _preview;
    if (cut == null || c == null) return;
    final next = cut.withCover((seconds * 1000).round());
    setState(() {
      _cut = next;
      _choosingCover = true;
    });
    c
      ..pause()
      ..seekTo(Duration(milliseconds: next.coverMs));
  }

  void _togglePreview() {
    final c = _preview;
    final cut = _cut;
    if (c == null || cut == null) return;
    if (c.value.isPlaying) {
      c.pause();
    } else {
      setState(() => _choosingCover = false);
      c
        ..seekTo(Duration(milliseconds: cut.startMs))
        ..play();
    }
    setState(() {});
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
      final photo = _Photo(await f.readAsBytes());
      if (!mounted) return;
      setState(() => _photos.add(photo));
      // ignore: unawaited_futures
      _uploadPhoto(photo);
    }
  }

  Future<void> _uploadPhoto(_Photo photo) async {
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

  bool get _insideReady =>
      _photos.every((p) => p.fileId != null) && _docs.ready;

  Future<void> _publish() async {
    final t = ref.read(translatorProvider);
    final file = _file;
    final cut = _cut;
    if (file == null || cut == null || !_insideReady) return;
    final repo = ref.read(reelsRepositoryProvider);
    setState(() {
      _publishing = true;
      _progress = 0;
    });
    _cancel = CancelToken();
    try {
      final video = await _compressed(file, cut);
      if (!mounted || (_cancel?.isCancelled ?? true)) return;
      final upload = await repo.createUpload(
        sizeBytes: await video.length(),
        durationSec: cut.sourceSec,
        title: _title.text.trim().isEmpty ? null : _title.text.trim(),
        trimStartMs: cut.trimmed ? cut.startMs : null,
        trimEndMs: cut.trimmed ? cut.endMs : null,
        coverTimeMs: cut.coverMs,
      );
      _assetId = upload.videoAssetId;
      await repo.upload(
        video,
        upload,
        cancel: _cancel,
        onProgress: (v) {
          if (mounted) setState(() => _progress = v);
        },
      );
      await ref.read(socialRepositoryProvider).createPost(
            PostDraft(
              title: _title.text.trim().isNotEmpty
                  ? _title.text.trim()
                  : _text.text.trim().characters.take(60).toString(),
              // The server needs a non-empty text; a reel without a caption
              // reuses its title.
              body: _text.text.trim().isNotEmpty
                  ? _text.text.trim()
                  : _title.text.trim(),
              videoAssetId: upload.videoAssetId,
              mediaFileIds: [for (final p in _photos) p.fileId!],
              attachments: _docs.refs,
              locationName:
                  _place.text.trim().isEmpty ? null : _place.text.trim(),
              commentsEnabled: _comments,
            ),
          );
      if (!mounted) return;
      // ignore: unawaited_futures
      HapticFeedback.mediumImpact();
      showAppSnackBar(context, t.t('reels.processing.toast'));
      Navigator.of(context).pop();
    } on Object catch (e) {
      final id = _assetId;
      if (id != null) repo.cancel(id).ignore();
      _assetId = null;
      if (!mounted) return;
      setState(() {
        _publishing = false;
        _progress = null;
      });
      if (!(e is DioException && CancelToken.isCancel(e))) {
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  /// Owner 2026-10-05: up to Full HD (admin: media.video_max_height) on
  /// the phone first — smaller upload, no visible loss; the original is
  /// kept when re-encoding fails or would not make it smaller, and in the
  /// browser (no encoder there).
  Future<XFile> _compressed(XFile file, ReelCut cut) async {
    if (kIsWeb) return file;
    final limits = videoLimitsOf(ref.read(featureFlagsControllerProvider));
    final size = _preview?.value.size ?? Size.zero;
    final need = needsVideoCompression(
      shortSide: math.min(size.width, size.height).round(),
      bytes: await file.length(),
      durationMs: cut.totalMs,
      limits: limits,
    );
    if (!need || !mounted) return file;
    setState(() {
      _compressing = true;
      _progress = 0;
    });
    final compressor = ref.read(videoCompressorProvider);
    _compressor = compressor;
    final out = await compressor.compress(
      file,
      limits: limits,
      onProgress: (p) {
        if (mounted) setState(() => _progress = p);
      },
    );
    if (mounted) {
      setState(() {
        _compressing = false;
        _progress = 0;
      });
    }
    return out ?? file;
  }

  /// Owner 2026-10-05: the part of the video the reel plays, and its cover.
  List<Widget> _cutSection(
    Translator t,
    AppColorTokens colors,
    AppTypographyTokens type,
    ReelCut cut,
  ) {
    final totalSec = cut.totalMs / 1000;
    return [
      const SizedBox(height: AppSpacing.lg),
      Row(
        children: [
          AppIcon(AppIcons.contentCutRounded, size: 20, color: colors.text),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(t.t('reels.trim.title'), style: type.titleMedium),
          ),
          Text(
            t.t('reels.trim.range', {
              'start': formatCutTime(cut.startMs),
              'end': formatCutTime(cut.endMs),
            }),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
      RangeSlider(
        values: RangeValues(cut.startMs / 1000, cut.endMs / 1000),
        max: totalSec,
        activeColor: colors.gold,
        inactiveColor: colors.border,
        labels: RangeLabels(
          formatCutTime(cut.startMs),
          formatCutTime(cut.endMs),
        ),
        semanticFormatterCallback: (v) => formatCutTime((v * 1000).round()),
        onChanged: _publishing ? null : _setRange,
      ),
      Text(
        t.t('reels.trim.hint', {
          'max': '$_kMaxSeconds',
          'source': '$_kSourceSeconds',
        }),
        style: type.caption.copyWith(color: colors.textSecondary),
      ),
      const SizedBox(height: AppSpacing.lg),
      Row(
        children: [
          AppIcon(AppIcons.imageOutlined, size: 20, color: colors.text),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(t.t('reels.cover.title'), style: type.titleMedium),
          ),
          Text(
            formatCutTime(cut.coverMs),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
      Slider(
        value: cut.coverMs / 1000,
        min: cut.startMs / 1000,
        max: cut.endMs / 1000,
        activeColor: colors.gold,
        inactiveColor: colors.border,
        label: formatCutTime(cut.coverMs),
        semanticFormatterCallback: (v) => formatCutTime((v * 1000).round()),
        onChanged: _publishing ? null : _setCover,
      ),
      Text(
        t.t('reels.cover.hint'),
        style: type.caption.copyWith(color: colors.textSecondary),
      ),
    ];
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
          ],
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('reels.inside.hint'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        Row(
          children: [
            Expanded(
              child: Text(
                t.t('reels.inside.photos'),
                style: type.body.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
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
                    onRemove: _publishing
                        ? null
                        : () => setState(() => _photos.remove(p)),
                    onRetry: () => _uploadPhoto(p),
                  ),
                ),
              if (_photos.length < _limits.maxPhotos)
                Semantics(
                  button: true,
                  label: t.t('reels.inside.addPhoto'),
                  excludeSemantics: true,
                  child: AppPressable(
                    onTap: _publishing ? null : _pickPhotos,
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
        PostDocumentsEditor(controller: _docs, enabled: !_publishing),
      ];

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = _preview;

    Widget source(IconData icon, String label, ImageSource s) => Expanded(
          child: AppPressable(
            onTap: _publishing ? null : () => _pick(s),
            child: Container(
              padding: const EdgeInsets.symmetric(
                vertical: AppSpacing.lg,
                horizontal: AppSpacing.sm,
              ),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Column(
                children: [
                  AppIcon(icon, color: colors.goldDark, size: 28),
                  const SizedBox(height: AppSpacing.sm),
                  FitText(
                    label,
                    textAlign: TextAlign.center,
                    style: type.body.copyWith(color: colors.text),
                  ),
                ],
              ),
            ),
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppIconButton(
          icon: const AppIcon(AppIcons.closeRounded),
          semanticLabel: t.t('common.close'),
          onPressed: () {
            _cancel?.cancel();
            if (_compressing) _compressor?.cancel().ignore();
            Navigator.of(context).maybePop();
          },
        ),
        title: Text(t.t('reels.create')),
      ),
      body: SafeArea(
        child: Column(
          children: [
            Expanded(
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                children: [
                  Center(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(AppRadii.card),
                      child: SizedBox(
                        width: 200,
                        height: 356,
                        child: c == null
                            ? ColoredBox(
                                color: colors.surface,
                                child: Center(
                                  child: AppIcon(
                                    AppIcons.filmReelOutlined,
                                    size: 48,
                                    color: colors.textSecondary,
                                  ),
                                ),
                              )
                            : Stack(
                                fit: StackFit.expand,
                                children: [
                                  GestureDetector(
                                    onTap: _togglePreview,
                                    child: FittedBox(
                                      fit: BoxFit.cover,
                                      clipBehavior: Clip.hardEdge,
                                      child: SizedBox(
                                        width: c.value.size.width,
                                        height: c.value.size.height,
                                        child: VideoPlayer(c),
                                      ),
                                    ),
                                  ),
                                  if (!c.value.isPlaying)
                                    const IgnorePointer(
                                      child: Center(
                                        child: AppIcon(
                                          AppIcons.playArrowRounded,
                                          size: 48,
                                          color: Colors.white70,
                                        ),
                                      ),
                                    ),
                                  PositionedDirectional(
                                    end: AppSpacing.sm,
                                    bottom: AppSpacing.sm,
                                    child: Text(
                                      formatReelDuration(
                                        ((_cut?.lengthMs ?? 0) / 1000).round(),
                                      ),
                                      style: type.caption.copyWith(
                                        color: Colors.white,
                                        shadows: const [
                                          Shadow(blurRadius: 6),
                                        ],
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Row(
                    children: [
                      source(
                        AppIcons.addPhotoAlternateOutlined,
                        t.t('reels.pick.gallery'),
                        ImageSource.gallery,
                      ),
                      const SizedBox(width: AppSpacing.md),
                      source(
                        AppIcons.videoCameraOutlined,
                        t.t('reels.pick.camera'),
                        ImageSource.camera,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    t.t('reels.limits', {'max': '$_kMaxSeconds'}),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  if (_cut != null) ..._cutSection(t, colors, type, _cut!),
                  const SizedBox(height: AppSpacing.lg),
                  AppTextField(
                    controller: _title,
                    hintText: t.t('reels.titleHint'),
                    semanticLabel: t.t('post.create.titleField'),
                    maxLength: kPostTitleMaxChars,
                    textCapitalization: TextCapitalization.sentences,
                  ),
                  const SizedBox(height: AppSpacing.md),
                  AppTextField(
                    controller: _text,
                    hintText: t.t('reels.captionHint'),
                    semanticLabel: t.t('post.create.bodyField'),
                    maxLength: kPostMaxChars,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
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
                    onChanged: _publishing
                        ? null
                        : (v) => setState(() => _comments = v),
                    title: Text(
                      t.t('reels.commentsOn'),
                      style: type.body.copyWith(color: colors.text),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  ..._insideSection(t, colors, type),
                  if (_progress != null) ...[
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      t.t(
                        _compressing ? 'reels.compressing' : 'reels.uploading',
                        {'percent': '${(_progress! * 100).round()}'},
                      ),
                      style: type.bodySmall.copyWith(color: colors.text),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(999),
                      child: LinearProgressIndicator(
                        value: _progress,
                        minHeight: 6,
                        color: colors.gold,
                        backgroundColor: colors.border,
                      ),
                    ),
                  ],
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: AppButton(
                label: t.t('reels.publish'),
                icon: AppIcons.sendRounded,
                isLoading: _publishing,
                // Owner 2026-10-07: say what is missing.
                disabledHint: _file == null
                    ? t.t('reels.need.video')
                    : (_title.text.trim().isEmpty && _text.text.trim().isEmpty)
                        ? t.t('reels.need.text')
                        : t.t('form.disabled.required'),
                isEnabled: !_publishing &&
                    _file != null &&
                    _insideReady &&
                    (_title.text.trim().isNotEmpty ||
                        _text.text.trim().isNotEmpty),
                onPressed: _publish,
              ),
            ),
          ],
        ),
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

  final _Photo photo;
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
