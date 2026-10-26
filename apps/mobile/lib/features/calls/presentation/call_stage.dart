import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_webrtc/flutter_webrtc.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/calls/application/call_controller.dart';
import 'package:lawbid/features/calls/application/call_media.dart';
import 'package:lawbid/features/calls/application/call_video_layout.dart';
import 'package:lawbid/features/calls/domain/call_models.dart';
import 'package:lawbid/features/calls/presentation/call_widgets.dart';

// Owner 2026-10-26 (calls like WhatsApp — docs/dev/calls-rework/
// whatsapp-style.png, REFERENCE.md): the picture part of a call.
//  - group video: tiles edge to edge with 3 px gaps and 10 px corners,
//    the last row stretching so an odd count never leaves a hole
//    (3 = 2 + 1, 5 = 2 + 2 + 1, 7 = 3 + 3 + 1, 8 = 3 + 3 + 2);
//    a tap on a tile makes that person big (WhatsApp), the others become a
//    strip of live cards above the controls; a tap on a card makes it the
//    big one; a tap on the big one goes back to the grid.
//  - every tile is the SAME widget in every layout (keyed by the person),
//    moved with AnimatedPositioned — the video never restarts and nothing
//    jumps (300 ms ease-out);
//  - voice calls: avatars on the green gradient, a green ring on whoever
//    speaks.

/// The gap between tiles.
const double kCallTileGap = 3;

/// Tile corners.
const double kCallTileRadius = 10;

/// A card in the strip under the big picture.
const Size kCallStripCard = Size(72, 96);
const double kCallStripGap = 8;

/// Columns for [n] tiles on a phone held upright: 1-2 one column (two are
/// stacked), 3-6 two, 7 and more three.
int callGridColumns(int n) => n <= 2
    ? 1
    : n <= 6
        ? 2
        : 3;

/// Where each of [count] tiles sits in [area]: rows share the height
/// equally, and a row with fewer tiles than columns stretches them to the
/// full width (no hole). More than nine: rows a third of the height each
/// (the grid scrolls). Left to right, top to bottom — the caller mirrors
/// for right-to-left.
List<Rect> callGridRects(int count, Size area, {double gap = kCallTileGap}) {
  if (count <= 0) return const [];
  final cols = callGridColumns(count);
  final rows = (count / cols).ceil();
  final rowH = count > 9
      ? (area.height - gap) / 3 - gap
      : (area.height - gap * (rows + 1)) / rows;
  final out = <Rect>[];
  for (var i = 0; i < count; i++) {
    final r = i ~/ cols;
    final c = i % cols;
    final inRow = math.min(cols, count - r * cols);
    final w = (area.width - gap * (inRow + 1)) / inRow;
    out.add(
      Rect.fromLTWH(
        gap + c * (w + gap),
        gap + r * (rowH + gap),
        w,
        math.max(0, rowH),
      ),
    );
  }
  return out;
}

/// The height the grid of [count] needs in [area] (more than the area when
/// it scrolls).
double callGridHeight(int count, Size area) {
  if (count <= 9) return area.height;
  final rows = (count / callGridColumns(count)).ceil();
  final rowH = (area.height - kCallTileGap) / 3 - kCallTileGap;
  return kCallTileGap + rows * (rowH + kCallTileGap);
}

/// One person big (the whole [screen]) and the others as cards in a row
/// whose bottom edge is [stripBottom] from the bottom of the screen,
/// scrolled by [stripScroll].
({Rect big, List<Rect> strip}) callFocusRects(
  int others,
  Size screen, {
  required double stripBottom,
  double stripScroll = 0,
}) {
  final top = screen.height - stripBottom - kCallStripCard.height;
  return (
    big: Offset.zero & screen,
    strip: [
      for (var i = 0; i < others; i++)
        Rect.fromLTWH(
          kCallStripGap +
              i * (kCallStripCard.width + kCallStripGap) -
              stripScroll,
          top,
          kCallStripCard.width,
          kCallStripCard.height,
        ),
    ],
  );
}

/// Mirrors a rect inside [width] (right-to-left layouts).
Rect _mirror(Rect r, double width, bool rtl) =>
    rtl ? Rect.fromLTWH(width - r.right, r.top, r.width, r.height) : r;

CallPeer callPeerOf(CallMember m) => CallPeer(
      id: m.userId,
      isAttorney: false,
      displayName: m.displayName,
      username: m.username,
      avatarUrl: m.avatarUrl,
    );

/// Group video: the grid, or one person big with the strip.
class CallGroupGrid extends ConsumerStatefulWidget {
  const CallGroupGrid({
    required this.session,
    required this.media,
    required this.controlsInset,
    required this.onTapBackground,
    super.key,
  });

  final CallSession session;
  final CallMediaView? media;

  /// How much of the bottom the controls take (0 while they are hidden).
  final double controlsInset;

  /// A single tap anywhere: show / hide the controls.
  final VoidCallback onTapBackground;

  /// Who is on screen: joined people and those still ringing; us first.
  static List<CallMember> visibleMembers(AppCall call, String? me) {
    final shown = <CallMember>[
      for (final m in call.participants)
        if (m.joined || m.ringing) m,
    ]..sort((a, b) {
        if (a.userId == me) return -1;
        if (b.userId == me) return 1;
        if (a.joined != b.joined) return a.joined ? -1 : 1;
        return 0;
      });
    return shown;
  }

  @override
  ConsumerState<CallGroupGrid> createState() => _CallGroupGridState();
}

class _CallGroupGridState extends ConsumerState<CallGroupGrid> {
  double _stripScroll = 0;

  @override
  Widget build(BuildContext context) {
    final m = widget.media;
    if (m == null) return _content(context, const {}, const {}, null);
    return ListenableBuilder(
      listenable: Listenable.merge([m.remoteStreams, m.localVideo, m.speaking]),
      builder: (context, _) => _content(
        context,
        m.remoteStreams.value,
        m.speaking.value,
        m.localVideo.value,
      ),
    );
  }

  Widget _content(
    BuildContext context,
    Map<String, MediaStream> remotes,
    Set<String> speaking,
    MediaStream? local,
  ) {
    final s = widget.session;
    final call = s.call;
    if (call == null) return const SizedBox.shrink();
    final me = ref.watch(callMyIdProvider);
    final layout = ref.watch(callVideoLayoutProvider);
    final camerasOff = ref.watch(callCamerasOffProvider);
    final frontCamera = ref.watch(callFrontCameraProvider);
    final members = CallGroupGrid.visibleMembers(call, me);
    final focused = s.video
        ? members.where((x) => x.userId == layout.focusId).firstOrNull
        : null;
    final notifier = ref.read(callVideoLayoutProvider.notifier);
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final safeBottom = MediaQuery.paddingOf(context).bottom;

    MediaStream? streamOf(CallMember x) {
      if (!s.video || !x.joined) return null;
      if (x.userId == me) return s.cameraOn ? local : null;
      if (camerasOff.contains(x.userId)) return null;
      return remotes[x.userId];
    }

    return LayoutBuilder(
      builder: (context, box) {
        final screen = box.biggest;
        final rects = <String, Rect>{};
        var height = screen.height;
        final strip = <String>{};
        if (focused != null) {
          final others = [
            for (final x in members)
              if (x.userId != focused.userId) x,
          ];
          final stripBottom = widget.controlsInset > 0
              ? widget.controlsInset + kCallStripGap
              : safeBottom + kCallStripGap * 2;
          final maxScroll = math.max(
            0,
            kCallStripGap +
                others.length * (kCallStripCard.width + kCallStripGap) -
                screen.width,
          );
          _stripScroll = _stripScroll.clamp(0, maxScroll.toDouble());
          final f = callFocusRects(
            others.length,
            screen,
            stripBottom: stripBottom,
            stripScroll: _stripScroll,
          );
          rects[focused.userId] = f.big;
          for (var i = 0; i < others.length; i++) {
            rects[others[i].userId] = _mirror(f.strip[i], screen.width, rtl);
            strip.add(others[i].userId);
          }
        } else {
          final area = Size(
            screen.width,
            math.max(0, screen.height - widget.controlsInset),
          );
          final grid = callGridRects(members.length, area);
          height =
              math.max(screen.height, callGridHeight(members.length, area));
          for (var i = 0; i < members.length; i++) {
            rects[members[i].userId] = _mirror(grid[i], screen.width, rtl);
          }
        }
        final duration =
            context.reduceMotion ? Duration.zero : CallMotion.layout;
        // The big one first (under), the strip cards over it.
        final order = [
          if (focused != null) focused,
          for (final x in members)
            if (x.userId != focused?.userId) x,
        ];
        final stack = Stack(
          children: [
            Positioned.fill(
              child: GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: widget.onTapBackground,
                child: const ColoredBox(color: AppCallColors.stage),
              ),
            ),
            for (final x in order)
              AnimatedPositioned.fromRect(
                key: ValueKey('tile-${x.userId}'),
                rect: rects[x.userId]!,
                duration: duration,
                curve: CallMotion.curve,
                child: _TileGestures(
                  member: x,
                  onTap: !s.video
                      ? widget.onTapBackground
                      : () {
                          notifier.showControls();
                          if (strip.contains(x.userId)) {
                            notifier.setMain(x.userId);
                          } else {
                            notifier.toggleFocus(x.userId);
                          }
                        },
                  child: CallTile(
                    member: x,
                    isMe: x.userId == me,
                    host: call.hostId == x.userId,
                    speaking: x.joined &&
                        speaking.contains(
                          x.userId == me ? kSelfSpeaker : x.userId,
                        ),
                    stream: streamOf(x),
                    mirror: callMirrorFor(
                      isLocal: x.userId == me,
                      frontCamera: frontCamera,
                    ),
                    micOff: x.userId == me ? s.muted : x.muted,
                    compact: strip.contains(x.userId),
                    big: x.userId == focused?.userId,
                  ),
                ),
              ),
          ],
        );
        // One tree in every layout (a wrapper that comes and goes would
        // rebuild every tile: the videos would restart and nothing could
        // glide to its new place).
        final scrolls = focused == null && height > screen.height + 0.5;
        return GestureDetector(
          // One person big: a swipe down goes back to everyone; a sideways
          // drag along the strip scrolls it.
          onVerticalDragEnd: focused == null
              ? null
              : (d) {
                  if ((d.primaryVelocity ?? 0) > 250) notifier.clearFocus();
                },
          onHorizontalDragUpdate: focused == null
              ? null
              : (d) => setState(
                    () => _stripScroll -= rtl ? -d.delta.dx : d.delta.dx,
                  ),
          child: SingleChildScrollView(
            physics: scrolls ? null : const NeverScrollableScrollPhysics(),
            child: SizedBox(
              width: screen.width,
              height: scrolls ? height : screen.height,
              child: stack,
            ),
          ),
        );
      },
    );
  }
}

/// Owner 2026-10-26 (exactly like WhatsApp): a tap on a tile makes that
/// person big, a tap on the big one goes back to the grid, a tap on a card
/// in the strip makes it the big one. Voice calls: a tap does nothing here.
class _TileGestures extends StatelessWidget {
  const _TileGestures({
    required this.member,
    required this.onTap,
    required this.child,
  });

  final CallMember member;
  final VoidCallback onTap;
  final Widget child;

  @override
  Widget build(BuildContext context) => GestureDetector(
        key: Key('call-tile-${member.userId}'),
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: child,
      );
}

/// One person in a group call: their camera or (camera off) their photo
/// on a dark tile; name and a mic-off mark in a small pill; a green ring
/// while they speak.
class CallTile extends StatelessWidget {
  const CallTile({
    required this.member,
    required this.isMe,
    required this.host,
    required this.speaking,
    required this.stream,
    required this.mirror,
    required this.micOff,
    required this.compact,
    required this.big,
    super.key,
  });

  final CallMember member;
  final bool isMe;
  final bool host;
  final bool speaking;
  final MediaStream? stream;
  final bool mirror;
  final bool micOff;

  /// A card in the strip: no name pill, no ⤢.
  final bool compact;

  /// The big one: no corners (it is the whole screen).
  final bool big;

  @override
  Widget build(BuildContext context) {
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ringing = member.ringing;
    final radius = big ? 0.0 : kCallTileRadius;
    final picture = stream;
    final t = ProviderScope.containerOf(context, listen: false)
        .read(translatorProvider);
    return Semantics(
      container: true,
      label: member.name,
      child: DecoratedBox(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(radius),
          boxShadow: compact
              ? const [BoxShadow(color: Colors.black45, blurRadius: 10)]
              : null,
        ),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(radius),
          child: Stack(
            fit: StackFit.expand,
            children: [
              const ColoredBox(color: AppCallColors.tileOff),
              AnimatedSwitcher(
                duration:
                    context.reduceMotion ? Duration.zero : CallMotion.quick,
                child: picture != null
                    // UI-01: one renderer per person for the whole call —
                    // a new stream (the SFU → mesh swap) goes into the same
                    // renderer, never a fresh black box.
                    ? CallVideoView(
                        key: ValueKey('video-${member.userId}'),
                        stream: picture,
                        mirror: mirror,
                      )
                    : Center(
                        key: const ValueKey('avatar'),
                        child: Opacity(
                          opacity: ringing ? 0.55 : 1,
                          child: LayoutBuilder(
                            builder: (_, box) => CallAvatar(
                              peer: callPeerOf(member),
                              size: (box.biggest.shortestSide *
                                      (compact
                                          ? 0.5
                                          : big
                                              ? 0.32
                                              : 0.42))
                                  .clamp(28, 140),
                            ),
                          ),
                        ),
                      ),
              ),
              // The speaker's ring (drawn over the picture, animated).
              IgnorePointer(
                child: AnimatedContainer(
                  duration:
                      context.reduceMotion ? Duration.zero : CallMotion.quick,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(radius),
                    border: Border.all(
                      color: speaking && !big
                          ? AppCallColors.speaking
                          : Colors.transparent,
                      width: 2.5,
                    ),
                  ),
                ),
              ),
              // The big one's name is the title at the top already.
              if (!compact && !big)
                PositionedDirectional(
                  start: 8,
                  bottom: 8,
                  end: 8,
                  child: Align(
                    alignment: AlignmentDirectional.centerStart,
                    child: _NamePill(
                      name: member.name,
                      micOff: micOff && !ringing,
                      host: host,
                      status: ringing ? t.t('call.status.calling') : null,
                      style: type.caption,
                    ),
                  ),
                ),
              if (compact && micOff && !ringing)
                const PositionedDirectional(
                  start: 6,
                  bottom: 6,
                  child: _MicOffDot(),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NamePill extends StatelessWidget {
  const _NamePill({
    required this.name,
    required this.micOff,
    required this.host,
    required this.status,
    required this.style,
  });

  final String name;
  final bool micOff;
  final bool host;
  final String? status;
  final TextStyle style;

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          color: Colors.black.withValues(alpha: 0.45),
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (micOff) ...[
                const AppIcon(
                  AppIcons.micOffRounded,
                  size: 13,
                  color: Colors.white,
                ),
                const SizedBox(width: 4),
              ],
              Flexible(
                child: Text(
                  status == null ? name : '$name · $status',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: style.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.w600,
                    fontSize: CallTextSizes.tile,
                  ),
                ),
              ),
              if (host) ...[
                const SizedBox(width: 4),
                const AppIcon(
                  AppIcons.starRounded,
                  size: 12,
                  color: AppCallColors.speaking,
                ),
              ],
            ],
          ),
        ),
      );
}

class _MicOffDot extends StatelessWidget {
  const _MicOffDot();

  @override
  Widget build(BuildContext context) => DecoratedBox(
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.black.withValues(alpha: 0.5),
        ),
        child: const Padding(
          padding: EdgeInsets.all(3),
          child: AppIcon(AppIcons.micOffRounded, size: 12, color: Colors.white),
        ),
      );
}

/// Voice calls: the dark green gradient behind everything.
class CallAudioBackdrop extends StatelessWidget {
  const CallAudioBackdrop({super.key});

  @override
  Widget build(BuildContext context) => const DecoratedBox(
        decoration: BoxDecoration(
          gradient: LinearGradient(
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
            colors: [AppCallColors.audioTop, AppCallColors.audioBottom],
          ),
        ),
      );
}

/// Group voice call: everyone's photo with the name under it, a green ring
/// on whoever speaks; rows centred (2 per row up to four, then 3).
class CallGroupAudio extends ConsumerWidget {
  const CallGroupAudio({
    required this.session,
    required this.media,
    required this.bottomInset,
    super.key,
  });

  final CallSession session;
  final CallMediaView? media;
  final double bottomInset;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final m = media;
    if (m == null) return _content(context, ref, const {});
    return ValueListenableBuilder<Set<String>>(
      valueListenable: m.speaking,
      builder: (context, now, _) => _content(context, ref, now),
    );
  }

  Widget _content(BuildContext context, WidgetRef ref, Set<String> speaking) {
    final call = session.call;
    if (call == null) return const SizedBox.shrink();
    final me = ref.watch(callMyIdProvider);
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final members = CallGroupGrid.visibleMembers(call, me);
    final cols = members.length <= 4 ? 2 : 3;
    final size = members.length <= 4 ? 96.0 : 76.0;
    final top = MediaQuery.paddingOf(context).top + 96;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, top, 16, bottomInset + 16),
      // Centred in the free space (WhatsApp); scrolls when it is crowded.
      child: LayoutBuilder(
        builder: (context, box) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: box.maxHeight),
            child: Center(
              child: Wrap(
                alignment: WrapAlignment.center,
                runSpacing: 24,
                children: [
                  for (final x in members)
                    SizedBox(
                      key: Key('call-tile-${x.userId}'),
                      width: (MediaQuery.sizeOf(context).width - 32) / cols,
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Opacity(
                            opacity: x.ringing ? 0.55 : 1,
                            child: CallAvatar(
                              peer: callPeerOf(x),
                              size: size,
                              ring: x.joined &&
                                      speaking.contains(
                                        x.userId == me
                                            ? kSelfSpeaker
                                            : x.userId,
                                      )
                                  ? AppCallColors.speaking
                                  : null,
                            ),
                          ),
                          const SizedBox(height: 8),
                          Row(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              if ((x.userId == me ? session.muted : x.muted) &&
                                  !x.ringing) ...[
                                const AppIcon(
                                  AppIcons.micOffRounded,
                                  size: 13,
                                  color: Colors.white70,
                                ),
                                const SizedBox(width: 4),
                              ],
                              Flexible(
                                child: Text(
                                  x.name,
                                  maxLines: 1,
                                  overflow: TextOverflow.ellipsis,
                                  textAlign: TextAlign.center,
                                  style: type.caption.copyWith(
                                    color: Colors.white,
                                    fontSize: CallTextSizes.status,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          if (x.ringing)
                            Text(
                              t.t('call.status.calling'),
                              style:
                                  type.caption.copyWith(color: Colors.white60),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
