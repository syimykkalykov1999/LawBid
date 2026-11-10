import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:lawbid/core/design_system/design_system.dart';

/// Owner 2026-10-22 (WhatsApp / Telegram): the chat list's scroll helpers.
///
/// * a round "down" pill with the count of new messages, shown once the
///   person scrolled away from the newest message (both apps);
/// * a date chip at the top that follows the scroll and fades out when it
///   stops (WhatsApp / Telegram "sticky date");
/// * a tap on a quoted message jumps to the original and flashes it
///   (loading older pages when it is not on screen yet).
///
/// The list is `reverse: true`: offset 0 is the newest message.
class ChatListController extends ChangeNotifier {
  ChatListController({
    required this.indexOfMessage,
    required this.loadOlder,
    required this.hasOlder,
  });

  final scroll = ScrollController();

  /// The entry (grouped bubble) holding message `id`, or -1.
  final int Function(String id) indexOfMessage;

  /// Asks for the next older page; completes when it arrived.
  final Future<void> Function() loadOlder;
  final bool Function() hasOlder;

  /// Away from the newest message by more than this: the pill shows.
  static const double pillAfter = 320;

  final highlight = ValueNotifier<String?>(null);
  final _keys = <String, GlobalKey>{};

  /// The key of the entry whose newest message is [id].
  GlobalKey keyFor(String id) => _keys.putIfAbsent(id, GlobalKey.new);

  /// S16-6: forget the keys of entries that are no longer in the list.
  void pruneKeys(Set<String> keep) =>
      _keys.removeWhere((id, _) => !keep.contains(id));

  /// The built context of the entry keyed by its newest message id.
  BuildContext? contextOf(String entryId) => _keys[entryId]?.currentContext;

  bool _disposed = false;

  bool get away => scroll.hasClients && scroll.offset > pillAfter;

  Future<void> toBottom() async {
    if (!scroll.hasClients) return;
    await scroll.animateTo(
      0,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  /// Scrolls to the entry holding message `messageId` and flashes it.
  /// Returns false when it could not be found.
  Future<bool> jumpTo(
    String messageId,
    String Function(int index) entryIdAt,
  ) async {
    for (var attempt = 0; attempt < 12 && !_disposed; attempt++) {
      final idx = indexOfMessage(messageId);
      if (idx < 0) {
        if (!hasOlder()) return false;
        await loadOlder();
        await _frame();
        continue;
      }
      final ctx = contextOf(entryIdAt(idx));
      if (ctx != null && ctx.mounted) {
        await Scrollable.ensureVisible(
          ctx,
          alignment: 0.4,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
        );
        _flash(messageId);
        return true;
      }
      // Not built yet: walk toward it by an estimate and look again.
      if (!scroll.hasClients) return false;
      final pos = scroll.position;
      final target = (idx * 96.0).clamp(0.0, pos.maxScrollExtent);
      final step = target > pos.pixels
          ? (pos.pixels + pos.viewportDimension).clamp(0.0, target)
          : target;
      scroll.jumpTo(step);
      await _frame();
      if (pos.pixels >= pos.maxScrollExtent - 1 &&
          indexOfMessage(messageId) < 0) {
        if (!hasOlder()) return false;
        await loadOlder();
      }
    }
    return false;
  }

  void _flash(String id) {
    highlight.value = id;
    Timer(const Duration(milliseconds: 1400), () {
      if (!_disposed && highlight.value == id) highlight.value = null;
    });
  }

  Future<void> _frame() {
    final c = Completer<void>();
    WidgetsBinding.instance.addPostFrameCallback((_) => c.complete());
    WidgetsBinding.instance.scheduleFrame();
    return c.future;
  }

  /// The index of the entry crossing the TOP edge of the viewport, from
  /// the list's render tree (null when nothing is laid out).
  int? topIndex(BuildContext listContext) => topEntry(listContext)?.index;

  /// [topIndex] with where that entry's top edge is, in pixels from the
  /// viewport's top (0 or less: it starts at or above the edge). Audit
  /// 26.10 W5: the floating date hides while the day's own chip, drawn at
  /// the top of its first entry, is still on screen.
  ({int index, double top})? topEntry(BuildContext listContext) {
    if (!scroll.hasClients) return null;
    final s = _sliverOf(listContext);
    if (s == null) return null;
    final edge = scroll.position.pixels + scroll.position.viewportDimension;
    int? best;
    var bestTop = 0.0;
    var child = s.firstChild;
    while (child != null) {
      final pd = child.parentData! as SliverMultiBoxAdaptorParentData;
      final index = pd.index;
      final start = pd.layoutOffset ?? 0;
      if (index != null && start <= edge && (best == null || index > best)) {
        best = index;
        // Reverse list: the entry's far end is its top on screen.
        bestTop = edge - (start + child.size.height);
      }
      child = s.childAfter(child);
    }
    return best == null ? null : (index: best, top: bestTop);
  }

  /// Owner 2026-10-26 (smoothness): the list's sliver is found once and
  /// kept while it stays in the tree, instead of walking the render tree
  /// on every scroll frame.
  RenderSliverMultiBoxAdaptor? _sliver;

  /// The list's sliver (null before the first layout).
  RenderSliverMultiBoxAdaptor? sliverOf(BuildContext listContext) =>
      _sliverOf(listContext);

  RenderSliverMultiBoxAdaptor? _sliverOf(BuildContext listContext) {
    final cached = _sliver;
    if (cached != null && cached.attached) return cached;
    _sliver = null;
    final root = listContext.findRenderObject();
    if (root == null) return null;
    RenderSliverMultiBoxAdaptor? found;
    void visit(RenderObject o) {
      if (found != null) return;
      if (o is RenderSliverMultiBoxAdaptor) {
        found = o;
        return;
      }
      o.visitChildren(visit);
    }

    visit(root);
    return _sliver = found;
  }

  @override
  void dispose() {
    _disposed = true;
    scroll.dispose();
    highlight.dispose();
    super.dispose();
  }
}

/// Gives bubbles the list's controller (for "jump to the quoted message").
class ChatListScope extends InheritedWidget {
  const ChatListScope({
    required this.controller,
    required this.jumpTo,
    required super.child,
    super.key,
  });

  final ChatListController controller;

  /// Jump to the message with this id.
  final Future<bool> Function(String messageId) jumpTo;

  static ChatListScope? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<ChatListScope>();

  @override
  bool updateShouldNotify(ChatListScope old) => controller != old.controller;
}

/// Flashes its child's background while the controller's highlight is
/// one of `ids`.
class ChatHighlight extends StatelessWidget {
  const ChatHighlight({
    required this.controller,
    required this.ids,
    required this.child,
    super.key,
  });

  final ChatListController controller;
  final Set<String> ids;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return ValueListenableBuilder<String?>(
      valueListenable: controller.highlight,
      builder: (context, id, child) => AnimatedContainer(
        duration: const Duration(milliseconds: 400),
        color: id != null && ids.contains(id)
            ? colors.gold.withValues(alpha: 0.22)
            : ChatColors.clear,
        child: child,
      ),
      child: child,
    );
  }
}

/// The round "down" button with the count of messages that came while the
/// person was reading above.
class ScrollToBottomPill extends StatelessWidget {
  const ScrollToBottomPill({
    required this.visible,
    required this.count,
    required this.countLabel,
    required this.onTap,
    required this.label,
    super.key,
  });

  final bool visible;
  final int count;

  /// The count as the person's digits (the caller formats it).
  final String countLabel;
  final VoidCallback onTap;
  final String label;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final reduce = MediaQuery.disableAnimationsOf(context);
    return IgnorePointer(
      ignoring: !visible,
      child: AnimatedOpacity(
        opacity: visible ? 1 : 0,
        duration: reduce ? Duration.zero : const Duration(milliseconds: 160),
        child: AnimatedScale(
          scale: visible ? 1 : 0.6,
          duration: reduce ? Duration.zero : const Duration(milliseconds: 160),
          child: Semantics(
            button: true,
            label: label,
            child: GestureDetector(
              onTap: onTap,
              child: SizedBox(
                width: 52,
                height: 52,
                child: Stack(
                  clipBehavior: Clip.none,
                  alignment: Alignment.center,
                  children: [
                    Container(
                      key: const ValueKey('scroll-to-bottom'),
                      width: 40,
                      height: 40,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: colors.surface,
                        border: Border.all(color: colors.border),
                        boxShadow: [
                          BoxShadow(
                            color: colors.text.withValues(alpha: 0.15),
                            blurRadius: 6,
                            offset: const Offset(0, 2),
                          ),
                        ],
                      ),
                      child: Center(
                        child: AppIcon(
                          AppIcons.expandMoreRounded,
                          color: colors.iconTint,
                        ),
                      ),
                    ),
                    if (count > 0)
                      PositionedDirectional(
                        top: 0,
                        end: 4,
                        child: Container(
                          key: const ValueKey('scroll-to-bottom-count'),
                          constraints: const BoxConstraints(minWidth: 18),
                          height: 18,
                          padding: const EdgeInsets.symmetric(horizontal: 5),
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                            color: colors.accent,
                            borderRadius: BorderRadius.circular(9),
                          ),
                          child: Text(
                            countLabel,
                            style: type.caption.copyWith(
                              color: colors.onAccent,
                              fontWeight: FontWeight.w700,
                              height: 1,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Audit 26.10 B3 (Telegram / WhatsApp): while the person reads older
/// messages, a message that comes in at the bottom of the reversed list
/// must not move the text under the finger. [hold] remembers a laid-out
/// row and where it was; on the next layout [ChatAnchorSliver] (the list's
/// last sliver) asks the viewport to shift the scroll offset by as much as
/// that row moved, so the viewport lays out again in the same frame and the
/// row is painted where it was (the same idea as the "keep position" chat
/// observers: anchor a reference item, correct by its offset change).
class ChatScrollAnchor {
  RenderBox? _row;
  double _offset = 0;
  RenderChatAnchorSliver? _sliver;

  /// Remembers the lowest row on screen of [list] (scrolled [pixels] up
  /// from the newest message). Call before the change is laid out.
  void hold(RenderSliverMultiBoxAdaptor? list, double pixels) {
    _row = null;
    if (list == null || pixels <= 0.5) return;
    var child = list.firstChild;
    RenderBox? best;
    var bestOffset = double.infinity;
    while (child != null) {
      final pd = child.parentData! as SliverMultiBoxAdaptorParentData;
      final at = pd.layoutOffset;
      if (at != null && at >= pixels && at < bestOffset) {
        best = child;
        bestOffset = at;
      }
      child = list.childAfter(child);
    }
    if (best == null) return;
    _row = best;
    _offset = bestOffset;
    _sliver?.markNeedsLayout();
  }

  /// [hold] for the list [scroll] drives (its first sliver list).
  void holdFor(ScrollController scroll) {
    if (!scroll.hasClients) return;
    final position = scroll.position;
    final root = position.context.notificationContext?.findRenderObject();
    RenderSliverMultiBoxAdaptor? found;
    void visit(RenderObject o) {
      if (found != null) return;
      if (o is RenderSliverMultiBoxAdaptor) {
        found = o;
        return;
      }
      o.visitChildren(visit);
    }

    if (root != null) visit(root);
    hold(found, position.pixels);
  }

  /// How far the held row moved since [hold] (once; 0 when nothing held).
  double _take() {
    final row = _row;
    _row = null;
    if (row == null || !row.attached) return 0;
    final pd = row.parentData;
    if (pd is! SliverMultiBoxAdaptorParentData) return 0;
    final at = pd.layoutOffset;
    return at == null ? 0 : at - _offset;
  }
}

/// The zero-size last sliver of a chat list that applies [anchor].
class ChatAnchorSliver extends LeafRenderObjectWidget {
  const ChatAnchorSliver({required this.anchor, super.key});

  final ChatScrollAnchor anchor;

  @override
  RenderObject createRenderObject(BuildContext context) =>
      RenderChatAnchorSliver(anchor);

  @override
  void updateRenderObject(
    BuildContext context,
    RenderChatAnchorSliver renderObject,
  ) =>
      renderObject.anchor = anchor;
}

/// The render object of [ChatAnchorSliver].
class RenderChatAnchorSliver extends RenderSliver {
  RenderChatAnchorSliver(ChatScrollAnchor anchor) : _anchor = anchor {
    anchor._sliver = this;
  }

  ChatScrollAnchor _anchor;
  ChatScrollAnchor get anchor => _anchor;
  set anchor(ChatScrollAnchor value) {
    if (identical(value, _anchor)) return;
    if (identical(_anchor._sliver, this)) _anchor._sliver = null;
    _anchor = value.._sliver = this;
  }

  @override
  void detach() {
    if (identical(_anchor._sliver, this)) _anchor._row = null;
    super.detach();
  }

  @override
  void performLayout() {
    final moved = _anchor._take();
    geometry = moved.abs() > 0.01
        ? SliverGeometry(scrollOffsetCorrection: moved)
        : SliverGeometry.zero;
  }
}
