import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/application/channel_compose.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_pickers.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';

/// Owner 2026-10-20: write a channel post (admins) — text up to 4000, up to
/// the admin's limit of photos OR one video; with [editing] it changes the
/// text of an existing post (the server edits the text only).
class ChannelComposerScreen extends ConsumerStatefulWidget {
  const ChannelComposerScreen({
    required this.channelId,
    this.editing,
    super.key,
  });

  final String channelId;
  final ChannelPost? editing;

  static Future<void> openEdit(
    BuildContext context,
    Channel channel,
    ChannelPost post,
  ) =>
      Navigator.of(context).push<void>(
        MaterialPageRoute(
          fullscreenDialog: true,
          builder: (_) => ChannelComposerScreen(
            channelId: channel.id,
            editing: post,
          ),
        ),
      );

  @override
  ConsumerState<ChannelComposerScreen> createState() =>
      _ChannelComposerScreenState();
}

class _ChannelComposerScreenState extends ConsumerState<ChannelComposerScreen> {
  late final _text = TextEditingController(text: widget.editing?.body ?? '');
  bool _saving = false;

  bool get _editing => widget.editing != null;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _addPhotos() async {
    final t = ref.read(translatorProvider);
    final max = channelMaxPhotos(ref);
    final compose = ref.read(channelComposeProvider(widget.channelId));
    final left = max - compose.photos.length;
    if (left <= 0) return;
    final picked = await ref.read(channelPhotoPickerProvider)(context, left);
    if (picked.isEmpty || !mounted) return;
    final skipped = ref
        .read(channelComposeProvider(widget.channelId).notifier)
        .addPhotos(picked, max: max);
    if (skipped > 0) {
      showAppSnackBar(
        context,
        t.t('channel.compose.photosLimit', {'max': '$max'}),
      );
    }
  }

  Future<void> _addVideo() async {
    final t = ref.read(translatorProvider);
    final max = channelMaxVideoSeconds(ref);
    final pick = await ref.read(channelVideoPickerProvider)(context, max);
    if (pick == null || !mounted) return;
    final video = pick.video;
    if (video == null) {
      showAppSnackBar(
        context,
        pick.problem == ChannelVideoProblem.tooLong
            ? t.t('channel.compose.videoTooLong', {'max': '$max'})
            : t.t('channel.compose.videoBad'),
      );
      return;
    }
    ref.read(channelComposeProvider(widget.channelId).notifier).setVideo(video);
  }

  Future<void> _publish() async {
    final t = ref.read(translatorProvider);
    final body = _text.text.trim();
    final nav = Navigator.of(context);
    setState(() => _saving = true);
    try {
      final edited = widget.editing;
      if (edited != null) {
        await ref
            .read(channelPostsProvider(widget.channelId).notifier)
            .edit(edited, body);
        if (mounted) nav.pop();
        return;
      }
      final post = await ref
          .read(channelComposeProvider(widget.channelId).notifier)
          .publish(body);
      if (post == null || !mounted) return;
      showAppSnackBar(context, t.t('channel.compose.published'));
      nav.pop();
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, channelErrorText(t, e));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _phaseLabel(Translator t, ChannelComposeState s) {
    final pct = '${(s.progress * 100).round()}';
    return switch (s.phase) {
      ChannelComposePhase.compressing =>
        t.t('channel.compose.compressing', {'percent': pct}),
      ChannelComposePhase.uploading =>
        t.t('channel.compose.uploading', {'percent': pct}),
      ChannelComposePhase.processing => t.t('channel.compose.processing'),
      _ => t.t('channel.compose.posting'),
    };
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final compose = ref.watch(channelComposeProvider(widget.channelId));
    final max = channelMaxPhotos(ref);
    final busy = compose.busy || _saving;
    return ChannelsGate(
      child: PopScope(
        canPop: !busy,
        child: Scaffold(
          backgroundColor: colors.bg,
          appBar: AppTopBar(
            leading: AppIconButton(
              key: const ValueKey('channel-compose-close'),
              icon: AppIcon(AppIcons.closeRounded, color: colors.text),
              semanticLabel: t.t('common.close'),
              onPressed: busy ? null : () => Navigator.of(context).maybePop(),
            ),
            title: Text(
              _editing
                  ? t.t('channel.compose.editTitle')
                  : t.t('channel.compose.title'),
            ),
          ),
          body: ValueListenableBuilder<TextEditingValue>(
            valueListenable: _text,
            builder: (context, value, _) {
              final body = value.text.trim();
              final tooLong = value.text.characters.length > kChannelPostMax;
              final hasContent = body.isNotEmpty || compose.hasMedia;
              final ready = !busy &&
                  !tooLong &&
                  (_editing ? body.isNotEmpty : hasContent) &&
                  compose.photosReady;
              return Column(
                children: [
                  Expanded(
                    child: ListView(
                      padding: const EdgeInsets.all(AppSpacing.screenSide),
                      children: [
                        AppTextField(
                          key: const ValueKey('channel-compose-text'),
                          controller: _text,
                          hintText: t.t('channel.compose.hint'),
                          semanticLabel: t.t('channel.compose.hint'),
                          maxLines: 10,
                          maxLength: kChannelPostMax,
                          textCapitalization: TextCapitalization.sentences,
                          enabled: !busy,
                          minHeight: 160,
                        ),
                        const SizedBox(height: AppSpacing.md),
                        if (_editing)
                          Text(
                            t.t('channel.compose.editHint'),
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          )
                        else ...[
                          Row(
                            children: [
                              Expanded(
                                child: AppButton(
                                  key: const ValueKey('channel-add-photos'),
                                  label: t.t('channel.compose.photos', {
                                    'count': '${compose.photos.length}',
                                    'max': '$max',
                                  }),
                                  icon: AppIcons.addPhotoAlternateOutlined,
                                  variant: AppButtonVariant.secondary,
                                  height: AppSizes.touchTarget,
                                  isEnabled: !busy &&
                                      compose.video == null &&
                                      compose.photos.length < max,
                                  onPressed: _addPhotos,
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              Expanded(
                                child: AppButton(
                                  key: const ValueKey('channel-add-video'),
                                  label: t.t('channel.compose.video'),
                                  icon: AppIcons.videoCameraOutlined,
                                  variant: AppButtonVariant.secondary,
                                  height: AppSizes.touchTarget,
                                  isEnabled: !busy &&
                                      compose.photos.isEmpty &&
                                      compose.video == null,
                                  onPressed: _addVideo,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            t.t('channel.compose.mediaHint'),
                            style: type.caption
                                .copyWith(color: colors.textSecondary),
                          ),
                          if (compose.photos.isNotEmpty) ...[
                            const SizedBox(height: AppSpacing.md),
                            Wrap(
                              spacing: AppSpacing.sm,
                              runSpacing: AppSpacing.sm,
                              children: [
                                for (final p in compose.photos)
                                  _PhotoTile(
                                    photo: p,
                                    locked: busy,
                                    removeLabel: t.t('channel.compose.remove'),
                                    retryLabel: t.t('error.retry'),
                                    onRemove: () => ref
                                        .read(
                                          channelComposeProvider(
                                            widget.channelId,
                                          ).notifier,
                                        )
                                        .removePhoto(p),
                                    onRetry: () => ref
                                        .read(
                                          channelComposeProvider(
                                            widget.channelId,
                                          ).notifier,
                                        )
                                        .retryPhoto(p),
                                  ),
                              ],
                            ),
                          ],
                          if (compose.video != null) ...[
                            const SizedBox(height: AppSpacing.md),
                            _VideoTile(
                              video: compose.video!,
                              locked: busy,
                              removeLabel: t.t('channel.compose.remove'),
                              onRemove: () => ref
                                  .read(
                                    channelComposeProvider(widget.channelId)
                                        .notifier,
                                  )
                                  .removeVideo(),
                            ),
                          ],
                        ],
                        if (compose.phase != ChannelComposePhase.idle) ...[
                          const SizedBox(height: AppSpacing.lg),
                          Semantics(
                            liveRegion: true,
                            label: _phaseLabel(t, compose),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                LinearProgressIndicator(
                                  key: const ValueKey(
                                    'channel-compose-progress',
                                  ),
                                  value: compose.phase ==
                                              ChannelComposePhase.compressing ||
                                          compose.phase ==
                                              ChannelComposePhase.uploading
                                      ? compose.progress
                                      : null,
                                  color: colors.gold,
                                  backgroundColor: colors.border,
                                ),
                                const SizedBox(height: AppSpacing.xs),
                                Text(
                                  _phaseLabel(t, compose),
                                  style: type.bodySmall
                                      .copyWith(color: colors.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          AppButton(
                            key: const ValueKey('channel-compose-cancel'),
                            label: t.t('common.cancel'),
                            variant: AppButtonVariant.secondary,
                            height: AppSizes.touchTarget,
                            onPressed: ref
                                .read(
                                  channelComposeProvider(widget.channelId)
                                      .notifier,
                                )
                                .cancel,
                          ),
                        ],
                        if (compose.error != null && !busy) ...[
                          const SizedBox(height: AppSpacing.md),
                          Container(
                            key: const ValueKey('channel-compose-error'),
                            padding: const EdgeInsets.all(AppSpacing.md),
                            decoration: BoxDecoration(
                              color: colors.dangerTint,
                              borderRadius:
                                  BorderRadius.circular(AppRadii.field),
                            ),
                            child: Text(
                              channelErrorText(t, compose.error!),
                              style: type.bodySmall
                                  .copyWith(color: colors.dangerText),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                  SafeArea(
                    top: false,
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.screenSide,
                        AppSpacing.sm,
                        AppSpacing.screenSide,
                        AppSpacing.md,
                      ),
                      child: AppButton(
                        key: const ValueKey('channel-compose-publish'),
                        label: _editing
                            ? t.t('common.save')
                            : compose.error != null
                                ? t.t('error.retry')
                                : t.t('channel.compose.publish'),
                        height: AppSizes.touchTarget,
                        isEnabled: ready,
                        isLoading: busy,
                        disabledHint: tooLong
                            ? t.t('channel.compose.tooLong', {
                                'max': '$kChannelPostMax',
                              })
                            : t.t('channel.compose.empty'),
                        onPressed: _publish,
                      ),
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _PhotoTile extends StatelessWidget {
  const _PhotoTile({
    required this.photo,
    required this.locked,
    required this.removeLabel,
    required this.retryLabel,
    required this.onRemove,
    required this.onRetry,
  });

  final ChannelPhotoDraft photo;
  final bool locked;
  final String removeLabel;
  final String retryLabel;
  final VoidCallback onRemove;
  final VoidCallback onRetry;

  static const _size = 92.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SizedBox(
      width: _size,
      height: _size,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.field),
            child: Image.memory(
              photo.bytes,
              fit: BoxFit.cover,
              cacheWidth: 276,
              gaplessPlayback: true,
              errorBuilder: (_, __, ___) => ColoredBox(color: colors.border),
            ),
          ),
          if (photo.uploading)
            Center(
              child: CircularProgressIndicator(
                value: photo.progress > 0 ? photo.progress : null,
                strokeWidth: 3,
                color: colors.gold,
              ),
            ),
          if (photo.error != null)
            Positioned.fill(
              child: Semantics(
                button: true,
                label: retryLabel,
                child: InkWell(
                  onTap: onRetry,
                  child: ColoredBox(
                    color: colors.dangerTint,
                    child: Center(
                      child: AppIcon(
                        AppIcons.refreshRounded,
                        color: colors.dangerText,
                      ),
                    ),
                  ),
                ),
              ),
            ),
          PositionedDirectional(
            top: 0,
            end: 0,
            child: Semantics(
              button: true,
              label: removeLabel,
              child: InkWell(
                onTap: locked ? null : onRemove,
                customBorder: const CircleBorder(),
                child: SizedBox.square(
                  dimension: AppSizes.touchTarget,
                  child: Center(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: colors.sheet,
                        shape: BoxShape.circle,
                        border: Border.all(color: colors.border),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.xs),
                        child: AppIcon(
                          AppIcons.closeRounded,
                          size: 16,
                          color: colors.text,
                        ),
                      ),
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

class _VideoTile extends StatelessWidget {
  const _VideoTile({
    required this.video,
    required this.locked,
    required this.removeLabel,
    required this.onRemove,
  });

  final ChannelVideoDraft video;
  final bool locked;
  final String removeLabel;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final mb = (video.size / (1024 * 1024)).toStringAsFixed(1);
    final sec = (video.durationSec % 60).toString().padLeft(2, '0');
    final length = '${video.durationSec ~/ 60}:$sec';
    return Container(
      key: const ValueKey('channel-video-draft'),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.field),
        border: Border.all(color: colors.border),
      ),
      padding: const EdgeInsets.all(AppSpacing.sm),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(AppRadii.button),
            child: SizedBox(
              width: 72,
              height: 72,
              child: video.frame == null
                  ? ColoredBox(
                      color: colors.border,
                      child: Center(
                        child: AppIcon(
                          AppIcons.filmReelOutlined,
                          color: colors.textSecondary,
                        ),
                      ),
                    )
                  : Image.memory(video.frame!, fit: BoxFit.cover),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              '$length · $mb MB',
              style: type.body.copyWith(color: colors.text),
            ),
          ),
          AppIconButton(
            key: const ValueKey('channel-video-remove'),
            icon: AppIcon(AppIcons.closeRounded, color: colors.text),
            semanticLabel: removeLabel,
            onPressed: locked ? null : onRemove,
          ),
        ],
      ),
    );
  }
}
