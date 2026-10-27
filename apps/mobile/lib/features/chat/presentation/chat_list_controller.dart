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
  int? topIndex(BuildContext listContext) {
    if (!scroll.hasClients) return null;
    final s = _sliverOf(listContext);
    if (s == null) return null;
    final edge = scroll.position.pixels + scroll.position.viewportDimension;
    int? best;
    var child = s.firstChild;
    while (child != null) {
      final pd = child.parentData! as SliverMultiBoxAdaptorParentData;
      final index = pd.index;
      final start = pd.layoutOffset ?? 0;
      if (index != null && start <= edge && (best == null || index > best)) {
        best = index;
      }
      child = s.childAfter(child);
    }
    return best;
  }

  /// Owner 2026-10-26 (smoothness): the list's sliver is found once and
  /// kept while it stays in the tree, instead of walking the render tree
  /// on every scroll frame.
  RenderSliverMultiBoxAdaptor? _sliver;

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
