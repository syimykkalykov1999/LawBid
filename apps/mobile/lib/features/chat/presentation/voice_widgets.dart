import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/media/app_image_cache.dart';
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
    // Only the playing bubble follows every position tick; the others
    // rebuild when the speed (shown on them) or their own state changes.
    final (VoicePlayback? current, double _) = ref.watch(
      voicePlayerProvider.select(
        (p) => (p.messageId == m.id ? p : null, p.speed),
      ),
    );
    // ignore: omit_local_variable_types
    final VoicePlayback playback = current ?? ref.read(voicePlayerProvider);
    final active = current != null;
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
        // The mini-player names who it is: my own notes say "You".
        title: mine ? t.t('chat.you') : avatarName,
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
              // Kept by the file (cache keyed by path), retried on a fresh link.
              : stableNetworkImage(url!, cache: AppImageCaches.chatMedia),
        ),
        PositionedDirectional(
          bottom: -2,
          start: badgeOnLeft ? -2 : null,
          end: badgeOnLeft ? null : -2,
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
///
/// Owner 2026-10-20 (WhatsApp): the strip has its final look from the first
/// frame: bars of one fixed width on fixed slots, so a new level only
/// fills the next slot on the right (older ones slide left); slots without
/// a level yet are small dots. The bars never change width as the list grows.
class RecordingMeter extends StatelessWidget {
  const RecordingMeter({required this.levels, super.key});

  final List<double> levels;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return SizedBox(
      height: 24,
      child: CustomPaint(
        painter: RecordingMeterPainter(
          levels: levels,
          color: colors.gold,
          rest: colors.gold.withValues(alpha: 0.35),
        ),
        size: const Size.fromHeight(24),
      ),
    );
  }
}

/// Bar width and gap of the recording strip (dp).
const kMeterBar = 2.5;
const kMeterGap = 2.5;

/// Paints [levels] (0–1) right-aligned on fixed slots.
class RecordingMeterPainter extends CustomPainter {
  RecordingMeterPainter({
    required this.levels,
    required this.color,
    required this.rest,
  });

  final List<double> levels;
  final Color color;
  final Color rest;

  /// How many slots fit in [width].
  static int slotsFor(double width) =>
      math.max(1, ((width + kMeterGap) / (kMeterBar + kMeterGap)).floor());

  @override
  void paint(Canvas canvas, Size size) {
    final slots = slotsFor(size.width);
    final paint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = kMeterBar;
    final shown =
        levels.length > slots ? levels.sublist(levels.length - slots) : levels;
    final empty = slots - shown.length;
    // The strip is centred as a whole so a width that is not a multiple of
    // the slot leaves equal margins instead of a ragged edge.
    final used = slots * (kMeterBar + kMeterGap) - kMeterGap;
    final left = (size.width - used) / 2 + kMeterBar / 2;
    for (var i = 0; i < slots; i++) {
      final x = left + i * (kMeterBar + kMeterGap);
      final has = i >= empty;
      final h = has
          ? math.max(3, size.height * (0.08 + 0.92 * shown[i - empty]))
          : kMeterBar;
      paint.color = has ? color : rest;
      canvas.drawLine(
        Offset(x, (size.height - h) / 2),
        Offset(x, (size.height + h) / 2),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(RecordingMeterPainter old) =>
      old.levels.length != levels.length ||
      (levels.isNotEmpty && old.levels.last != levels.last) ||
      old.color != color;
}

/// How long one slot of the live strip lasts: the strip slides one slot
/// left per period, continuously (sub-pixel), at the display's frame rate.
const kLiveSlotPeriod = Duration(milliseconds: 80);

/// What the live strip paints this frame (repaints without rebuilds).
class LiveMeterModel extends ChangeNotifier {
  /// Settled bars, oldest first (0…1, already smoothed).
  final List<double> bars = [];

  /// 0…1: how far the strip has slid towards the next slot.
  double shift = 0;

  /// The smoothed level of the bar coming in at the right edge.
  double live = 0;

  void changed() => notifyListeners();
}

/// Live bars while recording (Telegram / WhatsApp). Owner inbox 32: the level
/// is read on every frame (a Ticker, 60 / 120 Hz), eased towards the latest
/// microphone sample (no jumps when samples arrive late or in bursts), and the
/// strip slides right-to-left in step with the recording clock. Only the
/// painter repaints on a frame; nothing above it rebuilds.
class LiveRecordingMeter extends StatefulWidget {
  const LiveRecordingMeter({required this.source, super.key});

  final VoiceLevelSource source;

  /// Easing time constant of the level (ms): a few frames, smooth but lively.
  static const smoothingMs = 60.0;

  /// Bars kept (more than any phone width shows).
  static const keep = 160;

  @override
  State<LiveRecordingMeter> createState() => _LiveRecordingMeterState();
}

class _LiveRecordingMeterState extends State<LiveRecordingMeter>
    with SingleTickerProviderStateMixin {
  final LiveMeterModel _model = LiveMeterModel();
  late final Ticker _ticker = createTicker(_onTick);
  StreamSubscription<double>? _sub;
  double _target = 0;
  Duration _lastFrame = Duration.zero;
  int _slots = 0;

  @override
  void initState() {
    super.initState();
    _attach();
    unawaited(_ticker.start());
  }

  @override
  void didUpdateWidget(LiveRecordingMeter old) {
    super.didUpdateWidget(old);
    if (!identical(old.source, widget.source)) {
      unawaited(_sub?.cancel());
      _attach();
    }
  }

  /// Starts from what was recorded already (the strip appears on lock).
  void _attach() {
    final s = widget.source;
    final samples = s.samples;
    final now = s.elapsed.inMicroseconds / kLiveSlotPeriod.inMicroseconds;
    _slots = now.floor();
    _model.bars.clear();
    final per =
        kLiveSlotPeriod.inMicroseconds / kVoiceSamplePeriod.inMicroseconds;
    for (var k = math.max(0, _slots - LiveRecordingMeter.keep);
        k < _slots && samples.isNotEmpty;
        k++) {
      _model.bars.add(samples[math.min(samples.length - 1, (k * per).floor())]);
    }
    _target = samples.isEmpty ? 0 : samples.last;
    _model
      ..live = _target
      ..shift = now - _slots;
    _sub = s.levels.listen((v) => _target = v);
  }

  void _onTick(Duration t) {
    final dt = (t - _lastFrame).inMicroseconds / 1000;
    _lastFrame = t;
    final m = _model;
    // Exponential easing: the same feel at 60 and 120 Hz.
    m.live += (_target - m.live) *
        (1 - math.exp(-dt / LiveRecordingMeter.smoothingMs));
    final pos =
        widget.source.elapsed.inMicroseconds / kLiveSlotPeriod.inMicroseconds;
    final whole = pos.floor();
    if (whole - _slots > LiveRecordingMeter.keep) {
      _slots = whole - LiveRecordingMeter.keep;
    }
    while (_slots < whole) {
      m.bars.add(m.live);
      _slots++;
    }
    if (m.bars.length > LiveRecordingMeter.keep) {
      m.bars.removeRange(0, m.bars.length - LiveRecordingMeter.keep);
    }
    m
      ..shift = (pos - whole).clamp(0.0, 1.0)
      ..changed();
  }

  @override
  void dispose() {
    _ticker.dispose();
    unawaited(_sub?.cancel());
    _model.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return RepaintBoundary(
      child: SizedBox(
        height: 24,
        child: CustomPaint(
          painter: LiveMeterPainter(
            model: _model,
            color: colors.gold,
            rest: colors.gold.withValues(alpha: 0.35),
          ),
          size: const Size.fromHeight(24),
        ),
      ),
    );
  }
}

/// Paints a [LiveMeterModel]: the same fixed slots as [RecordingMeterPainter]
/// (bars of one width, dots where nothing is recorded yet), the bars slid
/// left by the model's shift, the live bar entering on the right.
class LiveMeterPainter extends CustomPainter {
  LiveMeterPainter({
    required this.model,
    required this.color,
    required this.rest,
  }) : super(repaint: model);

  final LiveMeterModel model;
  final Color color;
  final Color rest;

  @override
  void paint(Canvas canvas, Size size) {
    const step = kMeterBar + kMeterGap;
    final slots = RecordingMeterPainter.slotsFor(size.width);
    final used = slots * step - kMeterGap;
    final left = (size.width - used) / 2 + kMeterBar / 2;
    final bars = model.bars;
    final shift = model.shift;
    final shown = math.min(bars.length, slots);
    final empty = slots - shown;
    final paint = Paint()
      ..strokeCap = StrokeCap.round
      ..strokeWidth = kMeterBar;
    void bar(double x, double? level) {
      final h = level == null
          ? kMeterBar
          : math.max(3, size.height * (0.08 + 0.92 * level));
      paint.color = level == null ? rest : color;
      canvas.drawLine(
        Offset(x, (size.height - h) / 2),
        Offset(x, (size.height + h) / 2),
        paint,
      );
    }

    canvas
      ..save()
      ..clipRect(Offset.zero & size);
    // Dots stay put; the one the oldest bar slides onto gives way.
    for (var i = 0; i < empty; i++) {
      if (shown > 0 && i >= empty - shift - 0.5) continue;
      bar(left + i * step, null);
    }
    for (var j = 0; j < shown; j++) {
      bar(left + (empty + j - shift) * step, bars[bars.length - shown + j]);
    }
    // The bar of the current level, entering from the right.
    bar(left + (slots - shift) * step, model.live);
    canvas.restore();
  }

  @override
  bool shouldRepaint(LiveMeterPainter old) =>
      !identical(old.model, model) || old.color != color || old.rest != rest;
}

/// The recording clock: re-reads the recorder's monotonic time on every
/// frame and rebuilds only its own text, once a second.
class VoiceRecordingClock extends StatefulWidget {
  const VoiceRecordingClock({
    required this.source,
    required this.style,
    super.key,
  });

  final VoiceLevelSource source;
  final TextStyle style;

  @override
  State<VoiceRecordingClock> createState() => _VoiceRecordingClockState();
}

class _VoiceRecordingClockState extends State<VoiceRecordingClock>
    with SingleTickerProviderStateMixin {
  late final ValueNotifier<int> _seconds =
      ValueNotifier(widget.source.elapsed.inSeconds);
  late final Ticker _ticker = createTicker(
    (_) => _seconds.value = widget.source.elapsed.inSeconds,
  );

  @override
  void initState() {
    super.initState();
    unawaited(_ticker.start());
  }

  @override
  void dispose() {
    _ticker.dispose();
    _seconds.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ValueListenableBuilder<int>(
        valueListenable: _seconds,
        builder: (context, s, _) => Text(
          voiceClock(Duration(seconds: s)),
          maxLines: 1,
          softWrap: false,
          style: widget.style,
        ),
      );
}

/// The composer's recording strip (OQ-040): hold mode shows the red dot,
/// the clock and «slide to cancel»; lock mode the bin, the clock, the live
/// bars and pause; paused, play-back, the frozen wave and resume.
class VoiceRecordingBar extends ConsumerWidget {
  const VoiceRecordingBar({
    required this.source,
    required this.locked,
    required this.paused,
    required this.pausedAt,
    required this.waveform,
    required this.progress,
    required this.onCancel,
    required this.onTogglePreview,
    required this.onPause,
    this.previewPlaying = false,
    this.slideOpacity = 1,
    this.onSeek,
    this.onResume,
    super.key,
  });

  final VoiceLevelSource source;
  final bool locked;
  final bool paused;

  /// The time shown while paused (the preview position or the length).
  final Duration pausedAt;
  final List<int> waveform;
  final double progress;
  final bool previewPlaying;

  /// Hold mode: «slide to cancel» fades as the finger slides.
  final double slideOpacity;
  final VoidCallback onCancel;
  final VoidCallback onTogglePreview;
  final VoidCallback onPause;
  final void Function(double fraction)? onSeek;

  /// Paused with the file still open: carry on recording.
  final VoidCallback? onResume;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final clockStyle = type.body.copyWith(
      color: colors.text,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    return Container(
      height: AppSizes.touchTarget + 4,
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
      decoration: BoxDecoration(
        color: colors.bg,
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: colors.iconTint),
      ),
      child: Row(
        children: [
          if (locked)
            AppIconButton(
              icon:
                  AppIcon(AppIcons.deleteOutlineRounded, color: colors.danger),
              semanticLabel: t.t('chat.voice.cancel'),
              onPressed: onCancel,
            )
          else ...[
            const SizedBox(width: AppSpacing.sm),
            RecDot(color: colors.danger),
          ],
          if (paused)
            AppIconButton(
              icon: AppIcon(
                previewPlaying
                    ? AppIcons.pauseRounded
                    : AppIcons.playArrowRounded,
                color: colors.iconTint,
              ),
              semanticLabel: t.t(
                previewPlaying ? 'chat.voice.pause' : 'chat.voice.play',
              ),
              onPressed: onTogglePreview,
            )
          else
            const SizedBox(width: AppSpacing.sm),
          if (paused)
            Text(voiceClock(pausedAt), maxLines: 1, style: clockStyle)
          else
            VoiceRecordingClock(source: source, style: clockStyle),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: paused
                ? VoiceWave(
                    bars: waveform,
                    progress: progress,
                    onSeek: onSeek,
                  )
                : locked
                    ? LiveRecordingMeter(source: source)
                    : Opacity(
                        opacity: slideOpacity,
                        child: Text(
                          '‹ ${t.t('chat.voice.slideCancel')}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          textAlign: TextAlign.center,
                          style: type.bodySmall
                              .copyWith(color: colors.textSecondary),
                        ),
                      ),
          ),
          if (locked && !paused)
            AppIconButton(
              icon: AppIcon(AppIcons.pauseRounded, color: colors.danger),
              semanticLabel: t.t('chat.voice.pauseRec'),
              onPressed: onPause,
            ),
          if (paused && onResume != null)
            AppIconButton(
              icon: AppIcon(AppIcons.micRounded, color: colors.danger),
              semanticLabel: t.t('chat.voice.resume'),
              onPressed: onResume,
            ),
        ],
      ),
    );
  }
}

/// Blinking red dot of a running recording.
class RecDot extends StatefulWidget {
  const RecDot({required this.color, super.key});

  final Color color;

  @override
  State<RecDot> createState() => _RecDotState();
}

class _RecDotState extends State<RecDot> with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 900),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: context.reduceMotion
            ? const AlwaysStoppedAnimation(1)
            // ignore: prefer_int_literals
            : Tween(begin: 0.25, end: 1.0).animate(_c),
        child: Container(
          width: 10,
          height: 10,
          decoration:
              BoxDecoration(shape: BoxShape.circle, color: widget.color),
        ),
      );
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
                        color: colors.iconTint,
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
