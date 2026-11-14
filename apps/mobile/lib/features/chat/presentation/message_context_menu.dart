import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:lawbid/core/accessibility/reduce_motion.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner row 95 (2026-11-13, owner «Конечно»): a long press on a message
/// no longer opens a bottom sheet. The bubble lifts out of the chat, the
/// chat behind it blurs, the reactions bar appears above the bubble and the
/// actions menu below it — the pattern of Telegram, WhatsApp (since 2022)
/// and iMessage (`UIContextMenuInteraction` + the tapback bar).
///
/// The route is Flutter's `CupertinoContextMenu` route (`cupertino/
/// context_menu.dart`, BSD-3) as is where it can be: a [PopupRoute] with
/// the same barrier colour (`0x6604040F`), the same 5 px backdrop blur, the
/// same 335 ms popup duration and the same `easeOutBack` / `easeInBack`
/// curves for the lift, the bubble's rect tweened from where it sits in
/// the chat to where the menu fits. Only our look (colours, rows) is ours.
///
/// [anchor] is the bubble's global rect and [preview] what is drawn there
/// (a snapshot of the bubble, see [snapshotBubble]); without them (tests,
/// other callers) the bar and the menu sit at the bottom of the screen.
Future<void> showMessageContextMenu(
  BuildContext context, {
  required WidgetBuilder actions,
  WidgetBuilder? reactions,
  Rect? anchor,
  Widget? preview,
  Size? previewSize,
  VoidCallback? onPreviewTap,
  bool alignEnd = false,
  String? barrierLabel,
}) =>
    Navigator.of(context).push(
      MessageContextMenuRoute(
        actions: actions,
        reactions: reactions,
        anchor: anchor,
        preview: preview,
        previewSize: previewSize,
        onPreviewTap: onPreviewTap,
        alignEnd: alignEnd,
        barrierLabel: barrierLabel ??
            MaterialLocalizations.of(context).modalBarrierDismissLabel,
      ),
    );

/// The bubble's pixels at the moment of the long press (iOS uses a
/// snapshot as the context-menu preview, `UITargetedPreview`): nothing in
/// the bubble is built twice (no second video or voice player). `null`
/// when it cannot be taken (no `RepaintBoundary`, a renderer without
/// `toImageSync`); the menu then opens without the lifted bubble.
({Rect rect, ui.Image image})? snapshotBubble(BuildContext? bubble) {
  if (bubble == null || !bubble.mounted) return null;
  final box = bubble.findRenderObject();
  if (box is! RenderRepaintBoundary || !box.hasSize || !box.attached) {
    return null;
  }
  try {
    if (box.debugNeedsPaint) return null;
    final ratio = MediaQuery.maybeDevicePixelRatioOf(bubble) ?? 1;
    final image = box.toImageSync(pixelRatio: ratio);
    final rect = box.localToGlobal(Offset.zero) & box.size;
    return (rect: rect, image: image);
  } on Object {
    return null;
  }
}

class MessageContextMenuRoute extends PopupRoute<void> {
  MessageContextMenuRoute({
    required this.actions,
    this.reactions,
    this.anchor,
    this.preview,
    this.previewSize,
    this.onPreviewTap,
    this.alignEnd = false,
    this.barrierLabel,
    super.settings,
  }) : super(filter: ui.ImageFilter.blur(sigmaX: 5, sigmaY: 5));

  /// `CupertinoContextMenu`'s `_kModalBarrierColor`.
  static const Color barrierTint = AppOverlayColors.contextMenuBarrier;

  final WidgetBuilder actions;
  final WidgetBuilder? reactions;
  final Rect? anchor;
  final Widget? preview;

  /// The lifted preview's own size (a chat peek grows out of its row, the
  /// iOS context-menu preview); null: the bubble keeps the [anchor]'s size.
  final Size? previewSize;

  /// A tap on the preview: the menu closes, then this runs (a chat peek
  /// opens the chat, like iOS committing the preview). Null: it only closes.
  final VoidCallback? onPreviewTap;
  final bool alignEnd;

  @override
  final String? barrierLabel;

  @override
  Color get barrierColor => barrierTint;

  @override
  bool get barrierDismissible => true;

  @override
  Duration get transitionDuration => ReduceMotion.of(AppMotion.contextMenuOpen);

  @override
  Widget buildPage(
    BuildContext context,
    Animation<double> animation,
    Animation<double> secondaryAnimation,
  ) =>
      _MenuBody(route: this, animation: animation);
}

class _MenuBody extends StatefulWidget {
  const _MenuBody({required this.route, required this.animation});

  final MessageContextMenuRoute route;
  final Animation<double> animation;

  @override
  State<_MenuBody> createState() => _MenuBodyState();
}

class _MenuBodyState extends State<_MenuBody> {
  /// The page's own frame: the anchor is a global rect, the page may not
  /// start at the screen's corner (a bar above the navigator).
  final _frame = GlobalKey();

  Offset _origin() {
    final box = _frame.currentContext?.findRenderObject();
    if (box is! RenderBox || !box.attached) return Offset.zero;
    return box.localToGlobal(Offset.zero);
  }

  late final CurvedAnimation _lift = CurvedAnimation(
    parent: widget.animation,
    curve: AppMotion.contextMenuLiftIn,
    reverseCurve: AppMotion.contextMenuLiftOut,
  );

  @override
  void dispose() {
    _lift.dispose();
    super.dispose();
  }

  void _close() {
    final nav = Navigator.of(context);
    if (widget.route.isCurrent) nav.pop();
  }

  @override
  Widget build(BuildContext context) {
    final route = widget.route;
    final fade = widget.animation;
    final scale = Tween<double>(begin: 0.6, end: 1).animate(_lift);
    final bar = route.reactions;
    final media = MediaQuery.of(context);
    return Stack(
      key: _frame,
      children: [
        // The page covers the barrier: a tap on the blurred chat closes.
        Positioned.fill(
          child: GestureDetector(
            key: const ValueKey('msg-menu-outside'),
            behavior: HitTestBehavior.opaque,
            onTap: _close,
          ),
        ),
        CustomMultiChildLayout(
          delegate: _MenuLayout(
            lift: _lift,
            origin: _origin,
            anchor: route.anchor,
            previewSize: route.previewSize,
            alignEnd: route.alignEnd,
            padding: media.padding + media.viewInsets,
          ),
          children: [
            if (route.preview != null && route.anchor != null)
              LayoutId(
                id: _Slot.preview,
                child: GestureDetector(
                  key: const ValueKey('msg-menu-preview'),
                  onTap: () {
                    _close();
                    route.onPreviewTap?.call();
                  },
                  child: route.previewSize == null
                      ? FittedBox(
                          fit: BoxFit.fill,
                          child: SizedBox.fromSize(
                            size: route.anchor!.size,
                            child: route.preview,
                          ),
                        )
                      // The peek is laid out at its full size and revealed
                      // as its frame grows out of the row.
                      : ClipRRect(
                          borderRadius: BorderRadius.circular(AppRadii.card),
                          child: OverflowBox(
                            alignment: Alignment.topCenter,
                            minWidth: route.previewSize!.width,
                            maxWidth: route.previewSize!.width,
                            minHeight: route.previewSize!.height,
                            maxHeight: route.previewSize!.height,
                            child: route.preview,
                          ),
                        ),
                ),
              ),
            if (bar != null)
              LayoutId(
                id: _Slot.reactions,
                child: FadeTransition(
                  opacity: fade,
                  child: ScaleTransition(
                    scale: scale,
                    alignment: route.alignEnd
                        ? Alignment.bottomRight
                        : Alignment.bottomLeft,
                    child: Builder(builder: bar),
                  ),
                ),
              ),
            LayoutId(
              id: _Slot.actions,
              child: FadeTransition(
                opacity: fade,
                child: ScaleTransition(
                  scale: scale,
                  alignment:
                      route.alignEnd ? Alignment.topRight : Alignment.topLeft,
                  child: Builder(builder: route.actions),
                ),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

enum _Slot { preview, reactions, actions }

/// Where the three parts go. The bubble keeps its place when the bar fits
/// above it and the menu below; otherwise it moves (and a very tall bubble
/// shrinks) just enough — the rect is tweened from the bubble's place in
/// the chat on the lift curve, like `CupertinoContextMenu`'s `_rectTween`.
class _MenuLayout extends MultiChildLayoutDelegate {
  _MenuLayout({
    required this.lift,
    required this.anchor,
    required this.alignEnd,
    required this.padding,
    required this.origin,
    this.previewSize,
  }) : super(relayout: lift);

  /// Where the page sits on the screen (see `_MenuBodyState._origin`).
  final Offset Function() origin;

  static const double gap = 8;
  static const double margin = 8;
  static const double menuMaxWidth = 280;

  final Animation<double> lift;
  final Rect? anchor;
  final Size? previewSize;
  final bool alignEnd;
  final EdgeInsets padding;

  @override
  void performLayout(Size size) {
    final area = Rect.fromLTRB(
      margin,
      padding.top + margin,
      math.max(margin, size.width - margin),
      math.max(padding.top + margin, size.height - padding.bottom - margin),
    );
    final barSize = hasChild(_Slot.reactions)
        ? layoutChild(_Slot.reactions, BoxConstraints.loose(area.size))
        : Size.zero;
    final barSpace = barSize.height > 0 ? barSize.height + gap : 0.0;
    final menuSize = layoutChild(
      _Slot.actions,
      BoxConstraints(
        maxWidth: math.min(area.width, menuMaxWidth),
        maxHeight: math.max(0, area.height * 0.6),
      ),
    );
    final menuSpace = menuSize.height + gap;

    final from = anchor?.shift(-origin());
    final Rect target;
    if (from == null || !hasChild(_Slot.preview)) {
      // No lifted bubble: the bar and the menu sit at the bottom.
      final y = area.bottom - menuSpace;
      final x = alignEnd ? area.right : area.left;
      target = Rect.fromLTWH(x, y, 0, 0);
      _place(target, area, barSize, menuSize);
      return;
    }
    final room = area.height - barSpace - menuSpace;
    final want = previewSize ?? from.size;
    final s = want.height > room && room > 0
        ? math.max(room / want.height, 0.25)
        : 1.0;
    // A snapshot keeps its shape; a peek keeps its width and is cut lower.
    final w = math.min(want.width * (previewSize == null ? s : 1), area.width);
    final h = want.height * s;
    final lo = area.top + barSpace;
    final hi = area.bottom - menuSpace - h;
    final top = hi < lo ? lo : from.top.clamp(lo, hi);
    final left = previewSize != null
        ? area.left + (area.width - w) / 2
        : alignEnd
            ? from.right - w
            : from.left;
    final end = Rect.fromLTWH(left, top, w, h);
    final now = Rect.lerp(from, end, lift.value)!;
    layoutChild(
      _Slot.preview,
      BoxConstraints.tight(
        Size(math.max(0, now.width), math.max(0, now.height)),
      ),
    );
    positionChild(_Slot.preview, now.topLeft);
    _place(now, area, barSize, menuSize);
  }

  void _place(Rect bubble, Rect area, Size bar, Size menu) {
    double x(double width) {
      final want = alignEnd ? bubble.right - width : bubble.left;
      final max = math.max(area.left, area.right - width);
      return want.clamp(area.left, max);
    }

    if (hasChild(_Slot.reactions)) {
      positionChild(
        _Slot.reactions,
        Offset(x(bar.width), bubble.top - gap - bar.height),
      );
    }
    positionChild(_Slot.actions, Offset(x(menu.width), bubble.bottom + gap));
  }

  @override
  bool shouldRelayout(_MenuLayout old) =>
      old.anchor != anchor ||
      old.previewSize != previewSize ||
      old.alignEnd != alignEnd ||
      old.padding != padding ||
      old.lift != lift;
}

/// The rounded card the actions sit on (our colours; the shape of the
/// iOS / Telegram context menu).
class MessageMenuCard extends StatelessWidget {
  const MessageMenuCard({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Material(
      color: colors.surface,
      elevation: 8,
      shadowColor: colors.shadow,
      borderRadius: BorderRadius.circular(AppRadii.card),
      clipBehavior: Clip.antiAlias,
      child: child,
    );
  }
}

/// The reactions pill above the bubble; each emoji pops in a little after
/// the one before it (catalog M5: Telegram / WhatsApp / iMessage tapback
/// bar, 30 ms steps, `easeOutBack`).
class MessageReactionBar extends StatelessWidget {
  const MessageReactionBar({required this.children, this.below, super.key});

  final List<Widget> children;

  /// The premium emojis, when the bar is opened further.
  final Widget? below;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final still = context.reduceMotion;
    return Material(
      key: const ValueKey('msg-reaction-bar'),
      color: colors.surface,
      elevation: 8,
      shadowColor: colors.shadow,
      borderRadius: BorderRadius.circular(AppRadii.card),
      clipBehavior: Clip.antiAlias,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 2),
        child: AnimatedSize(
          duration: context.sizeChangeDuration,
          curve: AppMotion.enterCurve,
          alignment: Alignment.bottomCenter,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SingleChildScrollView(
                scrollDirection: Axis.horizontal,
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (var i = 0; i < children.length; i++)
                      _Staggered(index: i, still: still, child: children[i]),
                  ],
                ),
              ),
              if (below != null) below!,
            ],
          ),
        ),
      ),
    );
  }
}

class _Staggered extends StatefulWidget {
  const _Staggered({
    required this.index,
    required this.still,
    required this.child,
  });

  final int index;
  final bool still;
  final Widget child;

  @override
  State<_Staggered> createState() => _StaggeredState();
}

class _StaggeredState extends State<_Staggered>
    with SingleTickerProviderStateMixin {
  static const Duration step = Duration(milliseconds: 30);

  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: AppMotion.popIn + step * widget.index,
    value: widget.still ? 1 : 0,
  );

  late final Animation<double> _scale =
      Tween<double>(begin: 0.4, end: 1).animate(
    CurvedAnimation(
      parent: _c,
      curve: Interval(
        (step * widget.index).inMilliseconds /
            math.max(1, _c.duration!.inMilliseconds),
        1,
        curve: AppMotion.popCurve,
      ),
    ),
  );

  @override
  void initState() {
    super.initState();
    if (!widget.still) _c.forward();
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => widget.still
      ? widget.child
      : ScaleTransition(scale: _scale, child: widget.child);
}

/// Row 95 (catalog G13): the heart that pops where a message was double
/// tapped (Instagram's double-tap heart; Telegram pops its quick reaction
/// on the bubble). Grows past full size on `easeOutBack`, settles, then
/// fades as it rises a little. Reduce motion: nothing is drawn (the chip
/// under the bubble still says it).
void showQuickReactionPop(BuildContext context, String emoji, Offset at) {
  if (context.reduceMotion) return;
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  final box = overlay.context.findRenderObject() as RenderBox?;
  final local = box == null ? at : box.globalToLocal(at);
  late final OverlayEntry entry;
  entry = OverlayEntry(
    builder: (_) => _QuickReactionPop(
      emoji: emoji,
      at: local,
      onDone: () {
        if (entry.mounted) entry.remove();
      },
    ),
  );
  overlay.insert(entry);
}

class _QuickReactionPop extends StatefulWidget {
  const _QuickReactionPop({
    required this.emoji,
    required this.at,
    required this.onDone,
  });

  static const double size = 56;

  final String emoji;
  final Offset at;
  final VoidCallback onDone;

  @override
  State<_QuickReactionPop> createState() => _QuickReactionPopState();
}

class _QuickReactionPopState extends State<_QuickReactionPop>
    with SingleTickerProviderStateMixin {
  late final AnimationController _c = AnimationController(
    vsync: this,
    duration: AppMotion.quickReactionPop,
  );
  late final Animation<double> _scale = TweenSequence<double>([
    TweenSequenceItem(
      tween: Tween<double>(begin: 0.2, end: 1.2)
          .chain(CurveTween(curve: Curves.easeOut)),
      weight: 40,
    ),
    TweenSequenceItem(
      tween: Tween<double>(begin: 1.2, end: 1)
          .chain(CurveTween(curve: Curves.easeInOut)),
      weight: 20,
    ),
    TweenSequenceItem(tween: ConstantTween<double>(1), weight: 40),
  ]).animate(_c);
  late final Animation<double> _fade = Tween<double>(begin: 1, end: 0).animate(
    CurvedAnimation(parent: _c, curve: const Interval(0.7, 1)),
  );
  late final Animation<Offset> _rise = Tween<Offset>(
    begin: Offset.zero,
    end: const Offset(0, -0.3),
  ).animate(CurvedAnimation(parent: _c, curve: const Interval(0.6, 1)));

  @override
  void initState() {
    super.initState();
    _c.forward().whenComplete(widget.onDone);
  }

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const s = _QuickReactionPop.size;
    return Positioned(
      left: widget.at.dx - s / 2,
      top: widget.at.dy - s / 2,
      width: s,
      height: s,
      child: IgnorePointer(
        child: FadeTransition(
          opacity: _fade,
          child: SlideTransition(
            position: _rise,
            child: ScaleTransition(
              scale: _scale,
              child: FittedBox(
                child: Text(
                  widget.emoji,
                  key: const ValueKey('quick-reaction-pop'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}
