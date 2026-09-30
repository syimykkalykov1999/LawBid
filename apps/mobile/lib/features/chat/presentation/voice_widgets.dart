import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// OQ-040: a voice message inside a bubble, like Telegram — play/pause,
/// waveform that fills as it plays (tap or drag to seek), time, speed
/// 1×/1.5×/2× while playing, and a dot until the recipient has played it.
class VoiceMessageBody extends ConsumerWidget {
  const VoiceMessageBody({
    required this.message,
    required this.mine,
    required this.threadId,
    super.key,
  });

  final ChatMessage message;
  final bool mine;
  final String threadId;

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
    final fg = mine ? colors.onAccent : colors.text;
    final accent = mine ? colors.goldLight : colors.gold;
    final playable = v.url != null || v.localPath != null;
    final player = ref.read(voicePlayerProvider.notifier);

    Future<void> toggle() async {
      if (!playable) return;
      await player.toggle(m);
      if (!mine) {
        await ref.read(chatThreadProvider(threadId).notifier).voicePlayed(m);
      }
    }

    final button = Semantics(
      button: true,
      label: t.t(
          active && playback.playing ? 'chat.voice.pause' : 'chat.voice.play'),
      excludeSemantics: true,
      child: AppPressable(
        onTap: toggle,
        child: Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: playable ? accent : fg.withValues(alpha: 0.25),
          ),
          child: active && playback.loading
              ? Padding(
                  padding: const EdgeInsets.all(11),
                  child: CircularProgressIndicator(
                      strokeWidth: 2, color: colors.navy),
                )
              : Icon(
                  active && playback.playing
                      ? Icons.pause_rounded
                      : Icons.play_arrow_rounded,
                  color: colors.navy,
                  size: 26,
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
              ),
            ),
          ),
        );
      },
    );

    final shown =
        active && playback.position > Duration.zero ? playback.position : total;

    return Semantics(
      label: '${t.t('chat.voice.label')}, ${voiceClock(total)}',
      child: SizedBox(
        width: math.min(MediaQuery.sizeOf(context).width * 0.62, 260),
        child: Row(
          children: [
            button,
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  wave,
                  const SizedBox(height: 2),
                  Row(
                    children: [
                      Text(
                        playable
                            ? voiceClock(shown)
                            : t.t('chat.voice.unavailable'),
                        style: type.caption.copyWith(
                          color: fg.withValues(alpha: 0.8),
                          fontFeatures: const [FontFeature.tabularFigures()],
                        ),
                      ),
                      if (!v.listened && !m.isLocal) ...[
                        const SizedBox(width: 4),
                        Container(
                          width: 6,
                          height: 6,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: accent,
                          ),
                        ),
                      ],
                      const Spacer(),
                      if (active)
                        Semantics(
                          button: true,
                          label: t.t('chat.voice.speed'),
                          child: AppPressable(
                            onTap: player.cycleSpeed,
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 6, vertical: 1),
                              decoration: BoxDecoration(
                                borderRadius:
                                    BorderRadius.circular(AppRadii.pill),
                                color: fg.withValues(alpha: 0.15),
                              ),
                              child: Text(
                                '${_speed(playback.speed)}×',
                                style: type.caption.copyWith(
                                    color: fg, fontWeight: FontWeight.w700),
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  static String _speed(double s) =>
      s == s.roundToDouble() ? s.toInt().toString() : s.toString();
}

class _WavePainter extends CustomPainter {
  _WavePainter({
    required this.bars,
    required this.progress,
    required this.played,
    required this.rest,
  });

  final List<int> bars;
  final double progress;
  final Color played;
  final Color rest;

  @override
  void paint(Canvas canvas, Size size) {
    final data = bars.isEmpty ? List.filled(kVoiceBars, 10) : bars;
    const gap = 2.0;
    final w =
        math.max(1.5, (size.width - gap * (data.length - 1)) / data.length);
    final paint = Paint()..strokeCap = StrokeCap.round;
    for (var i = 0; i < data.length; i++) {
      final x = i * (w + gap) + w / 2;
      final h = math.max(3.0, size.height * data[i] / 100);
      paint
        ..color = (i + 0.5) / data.length <= progress ? played : rest
        ..strokeWidth = w;
      canvas.drawLine(Offset(x, (size.height - h) / 2 + h),
          Offset(x, (size.height - h) / 2), paint);
    }
  }

  @override
  bool shouldRepaint(_WavePainter old) =>
      old.progress != progress || old.bars != bars || old.played != played;
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
