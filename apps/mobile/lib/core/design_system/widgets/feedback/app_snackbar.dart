import 'dart:async';

import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';

/// Floating, rounded, surface-colored snackbar with a gold info glyph
/// (UI modernization pass, 2026-09-27). Opt-in per call site rather than a
/// global `snackBarTheme`, so the welcome screen's snackbar is unchanged.
///
/// [actionLabel] + [onAction]: an accent text button (e.g. "Undo", owner
/// 2026-10-01 — a checkmark set by mistake can be taken back at once).
void showAppSnackBar(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
}) {
  // Owner 2026-10-19 («нажимаю на оплату — ничего»): a snackbar lives in the
  // screen's Scaffold, UNDER a bottom sheet or a dialog, so an error from a
  // sheet (the boost's «Оплатить», a checkout) was never seen. From a sheet
  // or a dialog the message shows above everything instead.
  if (ModalRoute.of(context) is PopupRoute) {
    _showOverlayMessage(
      context,
      message,
      actionLabel: actionLabel,
      onAction: onAction,
    );
    return;
  }
  _showScaffoldSnackBar(
    context,
    message,
    actionLabel: actionLabel,
    onAction: onAction,
  );
}

OverlayEntry? _overlayMessage;

void _showOverlayMessage(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
}) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final typography = Theme.of(context).extension<AppTypographyTokens>()!;
  final overlay = Overlay.maybeOf(context, rootOverlay: true);
  if (overlay == null) return;
  _overlayMessage?.remove();
  late final OverlayEntry entry;
  void close() {
    if (identical(_overlayMessage, entry)) _overlayMessage = null;
    if (entry.mounted) entry.remove();
  }

  entry = OverlayEntry(
    builder: (context) {
      final mq = MediaQuery.of(context);
      return _AutoClose(
        onClose: close,
        child: Positioned(
          left: AppSpacing.lg,
          right: AppSpacing.lg,
          bottom: AppSpacing.lg + mq.viewInsets.bottom + mq.padding.bottom,
          child: Material(
            key: const ValueKey('app-overlay-message'),
            color: colors.surface,
            elevation: 6,
            borderRadius: BorderRadius.circular(AppRadii.field),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.md,
              ),
              child: Row(
                children: [
                  AppIcon(
                    AppIcons.infoOutlineRounded,
                    size: AppSizes.iconSm,
                    color: colors.gold,
                  ),
                  const SizedBox(width: AppSpacing.md),
                  Expanded(
                    child: Text(
                      message,
                      style: typography.body.copyWith(color: colors.text),
                    ),
                  ),
                  if (actionLabel != null && onAction != null)
                    TextButton(
                      onPressed: () {
                        close();
                        onAction();
                      },
                      child: Text(
                        actionLabel,
                        style: typography.body.copyWith(color: colors.accent),
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
      );
    },
  );
  _overlayMessage = entry;
  overlay.insert(entry);
}

/// Closes the message after 2.5 s; the timer ends with the widget.
///
/// Row 95 (motion catalog T2): the message used to pop in and out with no
/// motion. It now moves like Flutter's Material 3 floating `SnackBar`
/// (`material/snack_bar.dart`, BSD-3): it rises from the bottom
/// (`Curves.easeInOutQuart` height) while it fades in
/// (`Interval(0.4, 0.6, curve: Curves.easeInCirc)`), 250 ms each way, and
/// plays the same backwards before it goes. Reduce motion: no motion.
class _AutoClose extends StatefulWidget {
  const _AutoClose({required this.onClose, required this.child});

  final VoidCallback onClose;
  final Widget child;

  @override
  State<_AutoClose> createState() => _AutoCloseState();
}

class _AutoCloseState extends State<_AutoClose>
    with SingleTickerProviderStateMixin {
  late final Timer _timer;
  late final AnimationController _motion = AnimationController(
    vsync: this,
    duration: AppMotion.toastEnter,
    reverseDuration: AppMotion.toastExit,
  );
  late final Animation<double> _height = CurvedAnimation(
    parent: _motion,
    curve: Curves.easeInOutQuart,
  );
  late final Animation<double> _fade = CurvedAnimation(
    parent: _motion,
    curve: const Interval(0.4, 0.6, curve: Curves.easeInCirc),
  );
  bool _started = false;

  @override
  void initState() {
    super.initState();
    _timer = Timer(const Duration(milliseconds: 2500), _hide);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_started) return;
    _started = true;
    if (context.reduceMotion) {
      _motion.value = 1;
    } else {
      unawaited(_motion.forward());
    }
  }

  Future<void> _hide() async {
    if (!mounted) return;
    if (!context.reduceMotion) {
      try {
        await _motion.reverse().orCancel;
      } on TickerCanceled {
        return;
      }
    }
    if (mounted) widget.onClose();
  }

  @override
  void dispose() {
    _timer.cancel();
    _motion.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final positioned = widget.child;
    if (positioned is! Positioned) return positioned;
    return PositionedDirectional(
      start: positioned.left,
      end: positioned.right,
      bottom: positioned.bottom,
      top: positioned.top,
      child: ClipRect(
        child: FadeTransition(
          opacity: _fade,
          child: AnimatedBuilder(
            animation: _height,
            builder: (context, child) => Align(
              alignment: AlignmentDirectional.bottomStart,
              heightFactor: _height.value,
              child: child,
            ),
            child: positioned.child,
          ),
        ),
      ),
    );
  }
}

void _showScaffoldSnackBar(
  BuildContext context,
  String message, {
  String? actionLabel,
  VoidCallback? onAction,
}) {
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final typography = Theme.of(context).extension<AppTypographyTokens>()!;
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        // Owner 2026-10-20: a snackbar with an action never went away
        // (Flutter keeps it until tapped) and hung over every screen, in
        // a white system look. Now it closes by itself after 2.5 s, in the
        // theme's own surface.
        persist: false,
        duration: const Duration(milliseconds: 2500),
        backgroundColor: colors.surface,
        elevation: 6,
        margin: const EdgeInsets.all(AppSpacing.lg),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(AppRadii.field),
          side: BorderSide(color: colors.border),
        ),
        action: actionLabel == null || onAction == null
            ? null
            : SnackBarAction(
                label: actionLabel,
                textColor: colors.accent,
                onPressed: onAction,
              ),
        content: Row(
          children: [
            AppIcon(
              AppIcons.infoOutlineRounded,
              size: AppSizes.iconSm,
              color: colors.gold,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                message,
                style: typography.body.copyWith(color: colors.text),
              ),
            ),
          ],
        ),
      ),
    );
}
