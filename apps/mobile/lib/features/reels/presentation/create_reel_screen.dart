import 'dart:io';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:video_player/video_player.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/reels/application/reels_providers.dart';
import 'package:lawbid/features/reels/presentation/reel_video.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_repository.dart';

/// Owner 2026-10-01 — "+" → Reel: pick or record a vertical video, add a
/// title and a caption, publish. The file goes straight to Bunny (with a
/// progress bar, resumable); the reel appears in the feeds once Bunny has
/// encoded it — the author gets a notification.
class CreateReelScreen extends ConsumerStatefulWidget {
  const CreateReelScreen({super.key});

  @override
  ConsumerState<CreateReelScreen> createState() => _CreateReelScreenState();
}

/// Matches the server's `video.max_duration_sec` default; the server has
/// the final word (it answers with its own limit).
const _kMaxSeconds = 90;

class _CreateReelScreenState extends ConsumerState<CreateReelScreen> {
  final _title = TextEditingController();
  final _text = TextEditingController();
  File? _file;
  VideoPlayerController? _preview;
  int _seconds = 0;
  double? _progress;
  bool _publishing = false;
  CancelToken? _cancel;
  String? _assetId;

  @override
  void dispose() {
    _cancel?.cancel();
    _preview?.dispose();
    _title.dispose();
    _text.dispose();
    super.dispose();
  }

  Future<void> _pick(ImageSource source) async {
    final t = ref.read(translatorProvider);
    final x = await ImagePicker().pickVideo(
      source: source,
      maxDuration: const Duration(seconds: _kMaxSeconds),
      preferredCameraDevice: CameraDevice.rear,
    );
    if (x == null) return;
    final file = File(x.path);
    final c = VideoPlayerController.file(file);
    try {
      await c.initialize();
    } on Object {
      await c.dispose();
      if (mounted) showAppSnackBar(context, t.t('reels.badFile'));
      return;
    }
    final secs = (c.value.duration.inMilliseconds / 1000).ceil();
    if (secs > _kMaxSeconds) {
      await c.dispose();
      if (mounted) {
        showAppSnackBar(
            context, t.t('reels.tooLong', {'max': '$_kMaxSeconds'}));
      }
      return;
    }
    await c.setLooping(true);
    await c.setVolume(0);
    await c.play();
    await _preview?.dispose();
    if (!mounted) return;
    setState(() {
      _file = file;
      _preview = c;
      _seconds = secs;
    });
  }

  Future<void> _publish() async {
    final t = ref.read(translatorProvider);
    final file = _file;
    if (file == null) return;
    final repo = ref.read(reelsRepositoryProvider);
    setState(() {
      _publishing = true;
      _progress = 0;
    });
    _cancel = CancelToken();
    try {
      final upload = await repo.createUpload(
        sizeBytes: await file.length(),
        durationSec: _seconds,
        title: _title.text.trim().isEmpty ? null : _title.text.trim(),
      );
      _assetId = upload.videoAssetId;
      await repo.upload(
        file,
        upload,
        cancel: _cancel,
        onProgress: (v) {
          if (mounted) setState(() => _progress = v);
        },
      );
      await ref.read(socialRepositoryProvider).createPost(
            PostDraft(
              title: _title.text.trim(),
              body: _text.text.trim(),
              videoAssetId: upload.videoAssetId,
            ),
          );
      if (!mounted) return;
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
              padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              child: Column(
                children: [
                  AppIcon(icon, color: colors.goldDark, size: 28),
                  const SizedBox(height: AppSpacing.sm),
                  Text(label,
                      style: type.body.copyWith(color: colors.text)),
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
                                  child: AppIcon(AppIcons.filmReelOutlined,
                                      size: 48, color: colors.textSecondary),
                                ),
                              )
                            : Stack(
                                fit: StackFit.expand,
                                children: [
                                  FittedBox(
                                    fit: BoxFit.cover,
                                    clipBehavior: Clip.hardEdge,
                                    child: SizedBox(
                                      width: c.value.size.width,
                                      height: c.value.size.height,
                                      child: VideoPlayer(c),
                                    ),
                                  ),
                                  Positioned(
                                    right: AppSpacing.sm,
                                    bottom: AppSpacing.sm,
                                    child: Text(
                                      formatReelDuration(_seconds),
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
                      source(AppIcons.addPhotoAlternateOutlined,
                          t.t('reels.pick.gallery'), ImageSource.gallery),
                      const SizedBox(width: AppSpacing.md),
                      source(AppIcons.videoCameraOutlined,
                          t.t('reels.pick.camera'), ImageSource.camera),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    t.t('reels.limits', {'max': '$_kMaxSeconds'}),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
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
                  if (_progress != null) ...[
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      t.t('reels.uploading',
                          {'percent': '${(_progress! * 100).round()}'}),
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
                isEnabled: !_publishing && _file != null,
                onPressed: _publish,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
