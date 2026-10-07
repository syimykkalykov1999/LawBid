import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/semantics.dart';
import 'package:flutter/services.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cover.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart'
    show CountPill;

/// Owner 2026-10-07 (bug 16, "no huge cards"): one case as a compact row —
/// a small square picture, the title (2 lines), a short second text
/// (2 lines) and one line with the status, files and bids counts. Used by
/// "My cases" and the Search results.
class CompactCaseRow extends StatelessWidget {
  const CompactCaseRow({
    required this.title,
    required this.status,
    required this.onTap,
    this.description,
    this.coverUrl,
    this.coverKey,
    this.coverSeed,
    this.categoryCode,
    this.practiceCode,
    this.filesCount,
    this.bidsCount,
    this.newBids = 0,
    this.trailing,
    this.semanticLabel,
    super.key,
  });

  final String title;

  /// The status pill (or any small pill) that opens the bottom line.
  final Widget status;
  final VoidCallback onTap;
  final String? description;

  /// The case's first photo, when this viewer may see it.
  final String? coverUrl;

  /// The client's chosen cover (`art:N` / `icon:name`); null = a neutral
  /// tile with the practice icon.
  final String? coverKey;
  final String? coverSeed;
  final String? categoryCode;
  final String? practiceCode;

  /// Null = unknown (the row then shows no paperclip).
  final int? filesCount;
  final int? bidsCount;

  /// Bids the owner has not seen yet — a gold count on the picture.
  final int newBids;

  /// A small action at the end of the bottom line (e.g. Boost).
  final Widget? trailing;
  final String? semanticLabel;

  static const double thumb = 64;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final neutral = ColoredBox(
      color: colors.goldTint,
      child: Center(
        child: AppIcon(
          practiceGlyph(categoryCode),
          size: AppSizes.iconLg,
          color: colors.goldDark,
        ),
      ),
    );
    final picture = coverUrl != null
        ? CachedNetworkImage(
            imageUrl: coverUrl!,
            fit: BoxFit.cover,
            memCacheWidth: 200,
            placeholder: (_, __) => ColoredBox(color: colors.skeletonBase),
            errorWidget: (_, __, ___) => neutral,
          )
        : coverKey != null
            ? CaseCover(
                categoryCode: categoryCode,
                practiceCode: practiceCode,
                coverKey: coverKey,
                seed: coverSeed,
              )
            : neutral;

    Widget count(IconData icon, int n, {bool strong = false}) => Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIcon(
              icon,
              size: 15,
              color: strong ? colors.goldDark : colors.textSecondary,
            ),
            const SizedBox(width: 3),
            Text(
              '$n',
              style: type.bodySmall.copyWith(
                color: strong ? colors.goldDark : colors.textSecondary,
                fontWeight: strong ? FontWeight.w700 : FontWeight.w500,
              ),
            ),
          ],
        );

    final desc = description?.trim() ?? '';
    return Semantics(
      button: true,
      label: semanticLabel,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(AppSpacing.sm + 2),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.border),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              SizedBox.square(
                dimension: thumb,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    Positioned.fill(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(AppRadii.field),
                        child: ExcludeSemantics(child: picture),
                      ),
                    ),
                    if (newBids > 0)
                      Positioned(
                        top: -4,
                        right: -4,
                        child: CountPill(count: newBids),
                      ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                        height: 1.25,
                      ),
                    ),
                    if (desc.isNotEmpty) ...[
                      const SizedBox(height: 2),
                      Text(
                        desc,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(
                          color: colors.textSecondary,
                          height: 1.3,
                        ),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.sm),
                    Wrap(
                      spacing: AppSpacing.md,
                      runSpacing: AppSpacing.xs,
                      crossAxisAlignment: WrapCrossAlignment.center,
                      children: [
                        status,
                        if (filesCount != null)
                          count(AppIcons.attachFileRounded, filesCount!),
                        if (bidsCount != null)
                          count(
                            AppIcons.chatBubbleOutlineRounded,
                            bidsCount!,
                            strong: newBids > 0,
                          ),
                        if (trailing != null) trailing!,
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// One action behind a swiped row.
class SwipeAction {
  const SwipeAction({
    required this.label,
    required this.icon,
    required this.color,
    required this.onColor,
    required this.onTap,
    this.key,
  });

  final String label;
  final IconData icon;
  final Color color;
  final Color onColor;
  final VoidCallback onTap;
  final Key? key;
}

/// Owner 2026-10-07: swipe a row left to reveal its actions (Mail-like);
/// a tap on the row or a swipe right hides them again. Screen readers get
/// the same actions as custom semantics actions.
class SwipeActions extends StatefulWidget {
  const SwipeActions({
    required this.child,
    required this.actions,
    this.radius = AppRadii.card,
    super.key,
  });

  final Widget child;
  final List<SwipeAction> actions;
  final double radius;

  static const double actionWidth = 76;

  @override
  State<SwipeActions> createState() => _SwipeActionsState();
}

class _SwipeActionsState extends State<SwipeActions>
    with SingleTickerProviderStateMixin {
  late final _c = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 180),
  );

  double get _width => SwipeActions.actionWidth * widget.actions.length;

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  void _settle({required bool open}) {
    if (context.reduceMotion) {
      _c.value = open ? 1 : 0;
    } else if (open) {
      _c.forward();
    } else {
      _c.reverse();
    }
  }

  void _onUpdate(DragUpdateDetails d) {
    _c.value = (_c.value - d.delta.dx / _width).clamp(0.0, 1.0);
  }

  void _onEnd(DragEndDetails d) {
    final v = d.primaryVelocity ?? 0;
    final open = v < -300 || (v <= 300 && _c.value > 0.4);
    if (open && _c.value < 1) unawaited(HapticFeedback.selectionClick());
    _settle(open: open);
  }

  @override
  Widget build(BuildContext context) {
    if (widget.actions.isEmpty) return widget.child;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      customSemanticsActions: {
        for (final a in widget.actions)
          CustomSemanticsAction(label: a.label): a.onTap,
      },
      child: RawGestureDetector(
        behavior: HitTestBehavior.translucent,
        gestures: {
          _LeftFirstDrag: GestureRecognizerFactoryWithHandlers<_LeftFirstDrag>(
            () => _LeftFirstDrag(isOpen: () => _c.value > 0),
            (r) => r
              ..onUpdate = _onUpdate
              ..onEnd = _onEnd,
          ),
        },
        child: ClipRRect(
          borderRadius: BorderRadius.circular(widget.radius),
          child: Stack(
            children: [
              Positioned.fill(
                child: Align(
                  alignment: Alignment.centerRight,
                  child: AnimatedBuilder(
                    animation: _c,
                    builder: (context, _) => SizedBox(
                      width: _width * _c.value,
                      child: Row(
                        children: [
                          for (final a in widget.actions)
                            Expanded(
                              child: ExcludeSemantics(
                                child: _ActionButton(
                                  key: a.key,
                                  action: a,
                                  type: type,
                                  onTap: () {
                                    _settle(open: false);
                                    a.onTap();
                                  },
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                ),
              ),
              AnimatedBuilder(
                animation: _c,
                builder: (context, child) => Transform.translate(
                  offset: Offset(-_width * _c.value, 0),
                  child: child,
                ),
                child: ValueListenableBuilder<double>(
                  valueListenable: _c,
                  builder: (context, v, child) => v == 0
                      ? child!
                      : GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTap: () => _settle(open: false),
                          child: AbsorbPointer(child: child),
                        ),
                  child: widget.child,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ActionButton extends StatelessWidget {
  const _ActionButton({
    required this.action,
    required this.type,
    required this.onTap,
    super.key,
  });

  final SwipeAction action;
  final AppTypographyTokens type;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: ColoredBox(
          color: action.color,
          child: ClipRect(
            child: OverflowBox(
              maxWidth: SwipeActions.actionWidth,
              minWidth: SwipeActions.actionWidth,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AppIcon(
                    action.icon,
                    size: AppSizes.iconSm,
                    color: action.onColor,
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text(
                      action.label,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      textAlign: TextAlign.center,
                      style: type.caption.copyWith(
                        color: action.onColor,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
}

/// A horizontal drag that gives a rightward start back to the enclosing
/// tab swipe while the row is closed (only a leftward swipe opens it).
class _LeftFirstDrag extends HorizontalDragGestureRecognizer {
  _LeftFirstDrag({required this.isOpen});

  final bool Function() isOpen;
  final Map<int, double> _dx = {};

  @override
  void addAllowedPointer(PointerDownEvent event) {
    _dx[event.pointer] = 0;
    super.addAllowedPointer(event);
  }

  @override
  void handleEvent(PointerEvent event) {
    if (event is PointerMoveEvent && _dx.containsKey(event.pointer)) {
      final dx = _dx[event.pointer]! + event.delta.dx;
      _dx[event.pointer] = dx;
      if (dx < -2 || isOpen()) {
        // Leftward (or already open): this row owns the drag.
        _dx.remove(event.pointer);
      } else if (dx > 2) {
        _dx.remove(event.pointer);
        resolvePointer(event.pointer, GestureDisposition.rejected);
        return;
      }
    } else if (event is PointerUpEvent || event is PointerCancelEvent) {
      _dx.remove(event.pointer);
    }
    super.handleEvent(event);
  }

  @override
  void rejectGesture(int pointer) {
    _dx.remove(pointer);
    super.rejectGesture(pointer);
  }
}
