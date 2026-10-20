import 'dart:async';
import 'dart:math' as math;

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// OQ-040: a voice message inside a bubble. Owner 2026-10-17: like
/// WhatsApp — the sender's photo with a mic badge (gold until played,
/// blue once played), the speed button in its place while playing (the
/// chosen speed stays), a waveform with a round thumb (tap or drag to
/// seek), the time, and the next voice notes in a row play by themselves.
class VoiceMessageBody extends ConsumerWidget {
  const VoiceMessageBody({
    required this.message,
    required this.mine,
    required this.threadId,
    this.avatarUrl,
    this.avatarName,
    super.key,
  });

  final ChatMessage message;
  final bool mine;
  final String threadId;

  /// The sender's photo and name (initials when there is no photo).
  final String? avatarUrl;
  final String? avatarName;

  static const _avatarSize = 44.0;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final m = message;
    final v = m.voice!;
    final playback = ref.watch(voicePlayerProvider);
    final active = playback.messageId == m.id;
    final total = voiceLength(v);
    final progress = active && total.inMilliseconds > 0
        ? playback.position.inMilliseconds / total.inMilliseconds
        : 0.0;
    final chat = ChatColors.of(context);
    final fg = mine ? chat.onMine : chat.onTheirs;
    final accent = colors.goldAccent;
    final playable = v.url != null || v.localPath != null;
    final player = ref.read(voicePlayerProvider.notifier);
    // Download the note while it is on screen (a tap then plays at once).
    WidgetsBinding.instance.addPostFrameCallback((_) => player.prefetch(m));

    Future<void> toggle() async {
      if (!playable) return;
      if (player.callBusy) {
        showAppSnackBar(context, t.t('chat.voice.duringCall'));
        return;
      }
      final thread = ref.read(chatThreadProvider(threadId).notifier);
      // WhatsApp: the other side's voice notes right after this one.
      final all = ref.read(chatThreadProvider(threadId)).all;
      final at = all.indexWhere((x) => x.id == m.id);
      final then = <ChatMessage>[];
      for (var i = at - 1; !mine && at > 0 && i >= 0; i--) {
        final x = all[i];
        if (x.kind != MessageKind.voice ||
            x.voice == null ||
            x.senderId != m.senderId) {
          break;
        }
        then.add(x);
      }
      await player.toggle(
        m,
        title: avatarName,
        threadId: threadId,
        then: then,
        onAutoPlay: (x) async {
          try {
            await thread.voicePlayed(x);
          } on Object {
            // The chat was closed meanwhile.
          }
        },
      );
      if (!mine) await thread.voicePlayed(m);
    }

    final button = Semantics(
      button: true,
      label: t.t(
        active && playback.playing ? 'chat.voice.pause' : 'chat.voice.play',
      ),
      excludeSemantics: true,
      child: AppPressable(
        onTap: toggle,
        child: SizedBox(
          width: 36,
          height: 36,
          child: active && playback.loading
              ? Padding(
                  padding: const EdgeInsets.all(9),
                  child: CircularProgressIndicator(
                    strokeWidth: 2,
                    color: accent,
                  ),
                )
              : AppIcon(
                  active && playback.playing
                      ? AppIcons.pauseRounded
                      : AppIcons.playArrowRounded,
                  color: playable ? fg : fg.withValues(alpha: 0.35),
                  size: 34,
                ),
        ),
      ),
    );

    final wave = LayoutBuilder(
      builder: (context, box) {
        void seekAt(double dx) {
          if (!playable) return;
          player.seek(m, dx / box.maxWidth);
        }

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (d) => seekAt(d.localPosition.dx),
          onHorizontalDragUpdate: (d) => seekAt(d.localPosition.dx),
          child: SizedBox(
            height: 28,
            width: box.maxWidth,
            child: CustomPaint(
              painter: _WavePainter(
                bars: v.waveform,
                progress: progress,
                played: accent,
                rest: fg.withValues(alpha: 0.35),
                thumb: accent,
              ),
            ),
          ),
        );
      },
    );

    final shown =
        active && playback.position > Duration.zero ? playback.position : total;

    // WhatsApp: while a note plays (or is paused midway) its photo turns
    // into the speed button.
    final showSpeed =
        active && (playback.playing || playback.position > Duration.zero);
    final avatarSlot = SizedBox(
      width: _avatarSize,
      height: _avatarSize,
      child: AnimatedSwitcher(
        duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
        child: showSpeed
            ? Center(
                key: const ValueKey('speed'),
                child: Semantics(
                  button: true,
                  label: t.t('chat.voice.speed'),
                  child: AppPressable(
                    onTap: player.cycleSpeed,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 7,
                        vertical: 4,
                      ),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                        color: fg.withValues(alpha: 0.18),
                      ),
                      child: Text(
                        '${_speed(playback.speed)}×',
                        maxLines: 1,
                        softWrap: false,
                        style: type.caption.copyWith(
                          color: fg,
                          fontWeight: FontWeight.w700,
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                    ),
                  ),
                ),
              )
            : _MicAvatar(
                key: const ValueKey('avatar'),
                url: avatarUrl,
                name: avatarName,
                size: _avatarSize,
                // Gold until the recipient plays it, then blue (WhatsApp).
                badge: v.listened || m.isLocal
                    ? chat.tickRead
                    : mine
                        ? chat.mineMeta
                        : colors.goldAccent,
                ring: mine ? chat.mine : chat.theirs,
                badgeOnLeft: mine,
              ),
      ),
    );

    final body = Expanded(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const SizedBox(height: 6),
          wave,
          const SizedBox(height: 2),
          Text(
            playable ? voiceClock(shown) : t.t('chat.voice.unavailable'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: fg.withValues(alpha: 0.8),
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );

    return Semantics(
      label: '${t.t('chat.voice.label')}, ${voiceClock(total)}',
      child: SizedBox(
        width: math.min(MediaQuery.sizeOf(context).width * 0.66, 280),
        child: Row(
          children: mine
              ? [
                  button,
                  const SizedBox(width: AppSpacing.xs),
                  body,
                  const SizedBox(width: AppSpacing.sm),
                  avatarSlot,
                ]
              : [
                  avatarSlot,
                  const SizedBox(width: AppSpacing.sm),
                  button,
                  const SizedBox(width: AppSpacing.xs),
                  body,
                ],
        ),
      ),
    );
  }

  static String _speed(double s) =>
      s == s.roundToDouble() ? s.toInt().toString() : s.toString();
}

/// The sender's photo with a small mic badge in a corner (WhatsApp).
class _MicAvatar extends StatelessWidget {
  const _MicAvatar({
    required this.url,
    required this.name,
    required this.size,
    required this.badge,
    required this.ring,
    required this.badgeOnLeft,
    super.key,
  });

  final String? url;
  final String? name;
  final double size;
  final Color badge;

  /// The bubble's colour around the badge, so it reads on any photo.
  final Color ring;
  final bool badgeOnLeft;

  @override
  Widget build(BuildContext context) {
    const dot = 18.0;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        AppAvatar(
          size: size,
          initials: avatarInitials((name ?? '').trim().isEmpty ? '?' : name!),
          imageProvider: url == null
              ? null
              : CachedNetworkImageProvider(
                  url!,
                  // Signed URLs change per request: cache by the path.
                  cacheKey: Uri.parse(url!).path,
                ),
        ),
        Positioned(
          bottom: -2,
          left: badgeOnLeft ? -2 : null,
          right: badgeOnLeft ? null : -2,
          child: Container(
            width: dot,
            height: dot,
            decoration: BoxDecoration(
              color: ring,
              shape: BoxShape.circle,
            ),
            alignment: Alignment.center,
            child: AppIcon(AppIcons.micRounded, size: 13, color: badge),
          ),
        ),
      ],
    );
  }
}

class _WavePainter extends CustomPainter {
  _WavePainter({
    required this.bars,
    required this.progress,
    required this.played,
    required this.rest,
    this.thumb,
  });

  final List<int> bars;
  final double progress;
  final Color played;
  final Color rest;

  /// The round seek thumb (WhatsApp); null = none (the recording meter).
  final Color? thumb;

  @override
  void paint(Canvas canvas, Size size) {
    final data = bars.isEmpty ? List.filled(kVoiceBars, 10) : bars;
    const gap = 2.0;
    final w =
        math.max(1.5, (size.width - gap * (data.length - 1)) / data.length);
    final paint = Paint()..strokeCap = StrokeCap.round;
    for (var i = 0; i < data.length; i++) {
      final x = i * (w + gap) + w / 2;
      // ignore: prefer_int_literals
      final h = math.max(3.0, size.height * data[i] / 100);
      paint
        ..color = (i + 0.5) / data.length <= progress ? played : rest
        ..strokeWidth = w;
      canvas.drawLine(
        Offset(x, (size.height - h) / 2 + h),
        Offset(x, (size.height - h) / 2),
        paint,
      );
    }
    final t = thumb;
    if (t != null) {
      const r = 6.0;
      final cx = (size.width * progress).clamp(r, size.width - r);
      canvas.drawCircle(Offset(cx, size.height / 2), r, Paint()..color = t);
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) =>
      old.progress != progress ||
      old.bars != bars ||
      old.played != played ||
      old.thumb != thumb;
}

/// Live bars while recording (the newest on the right).
class RecordingMeter extends StatelessWidget {
  const RecordingMeter({required this.levels, super.key});

  final List<double> levels;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SizedBox(
      height: 24,
      child: CustomPaint(
        painter: _WavePainter(
          bars: [for (final l in levels) (8 + 92 * l).round()],
          progress: 1,
          played: colors.gold,
          rest: colors.gold,
        ),
      ),
    );
  }
}

/// A waveform with a seek thumb (the preview of a locked recording).
class VoiceWave extends StatelessWidget {
  const VoiceWave({
    required this.bars,
    required this.progress,
    this.onSeek,
    super.key,
  });

  final List<int> bars;
  final double progress;

  /// Tap or drag: a 0…1 position; null = not seekable.
  final void Function(double fraction)? onSeek;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return LayoutBuilder(
      builder: (context, box) {
        void at(double dx) => onSeek?.call((dx / box.maxWidth).clamp(0.0, 1.0));
        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTapDown: (d) => at(d.localPosition.dx),
          onHorizontalDragUpdate: (d) => at(d.localPosition.dx),
          child: SizedBox(
            height: 28,
            width: box.maxWidth,
            child: CustomPaint(
              painter: _WavePainter(
                bars: bars,
                progress: progress,
                played: colors.gold,
                rest: colors.textSecondary.withValues(alpha: 0.4),
                thumb: onSeek == null ? null : colors.gold,
              ),
            ),
          ),
        );
      },
    );
  }
}

/// WhatsApp: a note keeps playing after the chat is left; this strip under
/// the status bar shows who it is, with play/pause, speed and close.
class VoiceMiniPlayer extends ConsumerWidget {
  const VoiceMiniPlayer({required this.onOpen, super.key});

  /// Opens the chat of the playing note.
  final void Function(String threadId) onOpen;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final p = ref.watch(voicePlayerProvider);
    if (p.messageId == null || p.messageId == kVoiceDraftId) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final player = ref.read(voicePlayerProvider.notifier);
    final total = Duration(milliseconds: p.durationMs);
    final progress = total.inMilliseconds > 0
        ? (p.position.inMilliseconds / total.inMilliseconds).clamp(0.0, 1.0)
        : 0.0;
    final speed = p.speed == p.speed.roundToDouble()
        ? p.speed.toInt().toString()
        : p.speed.toString();
    return Material(
      color: colors.surface,
      child: SafeArea(
        bottom: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            InkWell(
              onTap: p.threadId == null ? null : () => onOpen(p.threadId!),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
                child: Row(
                  children: [
                    AppIconButton(
                      icon: AppIcon(
                        p.playing
                            ? AppIcons.pauseRounded
                            : AppIcons.playArrowRounded,
                        color: colors.goldDark,
                      ),
                      semanticLabel: t.t(
                        p.playing ? 'chat.voice.pause' : 'chat.voice.play',
                      ),
                      onPressed: () => unawaited(player.playPause()),
                    ),
                    Expanded(
                      child: Text(
                        '${t.t('chat.voice.label')}'
                        '${p.title == null ? '' : ' · ${p.title}'}'
                        ' · ${voiceClock(p.position)} / ${voiceClock(total)}',
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(color: colors.text),
                      ),
                    ),
                    AppPressable(
                      onTap: player.cycleSpeed,
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.sm),
                        child: Text(
                          '$speed×',
                          style: type.caption.copyWith(
                            color: colors.goldDark,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                    ),
                    AppIconButton(
                      icon: AppIcon(
                        AppIcons.closeRounded,
                        color: colors.textSecondary,
                      ),
                      semanticLabel: t.t('chat.voice.stop'),
                      onPressed: () => unawaited(player.stop()),
                    ),
                  ],
                ),
              ),
            ),
            LinearProgressIndicator(
              value: progress,
              minHeight: 2,
              color: colors.gold,
              backgroundColor: colors.border,
            ),
          ],
        ),
      ),
    );
  }
}
