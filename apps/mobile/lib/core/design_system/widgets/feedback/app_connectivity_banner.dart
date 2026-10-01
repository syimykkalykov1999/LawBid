import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/rendering.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/theme/app_typography_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_motion.dart';
import 'package:lawbid/core/design_system/tokens/app_radii.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_entrance.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_pressable.dart';
import 'package:lawbid/core/design_system/widgets/motion/app_tap_target.dart';
import 'package:lawbid/core/design_system/icons/app_icon.dart';
import 'package:lawbid/core/design_system/icons/app_icons.dart';

/// What an [AppConnectivityBanner] is reporting.
enum AppConnectivityBannerTone {
  /// No connection / server unreachable — stays until the network is back.
  offline,

  /// Short "back online" confirmation after an [offline] period.
  restored,
}

/// The offline band shown across the top of the app (docs/01 §8.3:
/// "Offline (баннер сверху, показ кэша)"). Presentational only — the
/// connectivity state, strings (`t()` keys) and retry come from the caller
/// (`OfflineBannerHost` in core/connectivity).
///
/// Visual language (ui-ux-pro-max "Trust & Authority", p12 leaf-1.6): an
/// inverse band (`text` as background, `bg` as foreground — the same
/// pairing as `showAppSnackBar`) with a gold hairline underneath, so it
/// reads as system status rather than an error. It paints behind the
/// status bar (the top inset from [MediaQuery]) and flips the status-bar
/// icon brightness to stay legible.
///
/// Screen readers: the band is a polite live region — the message is
/// announced when it appears/changes, focus is never moved (WCAG 4.1.3).
class AppConnectivityBanner extends StatelessWidget {
  const AppConnectivityBanner({
    required this.message,
    super.key,
    this.tone = AppConnectivityBannerTone.offline,
    this.actionLabel,
    this.onAction,
    this.busy = false,
    this.busyLabel,
  });

  final String message;
  final AppConnectivityBannerTone tone;

  /// Optional "Retry" action (`t('error.retry')`) — re-checks the
  /// connection right away instead of waiting for the next backoff probe.
  final String? actionLabel;
  final VoidCallback? onAction;

  /// A re-check is in flight: the action shows a spinner and is disabled.
  final bool busy;

  /// Announced/semantic label while [busy] (e.g. `t('connectivity.checking')`).
  final String? busyLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final topInset = MediaQuery.paddingOf(context).top;
    final background = colors.text;
    final foreground = colors.bg;
    // Gold on the navy-ink band (light theme) is 7.6:1; on the cream band
    // (dark theme) plain gold is only 2.1:1, so the darker gold is used
    // there (4.1:1) — both above the 3:1 non-text minimum.
    final accent = switch (tone) {
      AppConnectivityBannerTone.offline =>
        isDark ? colors.goldDark : colors.gold,
      AppConnectivityBannerTone.restored => colors.success,
    };
    final icon = switch (tone) {
      AppConnectivityBannerTone.offline => AppIcons.wifiOffRounded,
      AppConnectivityBannerTone.restored => AppIcons.checkCircleRounded,
    };

    final band = Container(
      width: double.infinity,
      decoration: BoxDecoration(
        color: background,
        border: Border(
          bottom: BorderSide(color: colors.goldStroke.withValues(alpha: 0.7)),
        ),
      ),
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        topInset + AppSpacing.xs,
        AppSpacing.lg,
        AppSpacing.xs,
      ),
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppSizes.bannerMinHeight),
        child: Row(
          children: [
            ExcludeSemantics(
              child: AppIcon(icon, size: AppSizes.iconSm, color: accent),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Semantics(
                liveRegion: true,
                child: Text(
                  message,
                  style: typography.bodySmall.copyWith(
                    color: foreground,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
            if (actionLabel != null && onAction != null) ...[
              const SizedBox(width: AppSpacing.sm),
              _BannerAction(
                label: actionLabel!,
                busyLabel: busyLabel,
                busy: busy,
                onTap: onAction!,
                foreground: foreground,
              ),
            ],
          ],
        ),
      ),
    );

    return AnnotatedRegion<SystemUiOverlayStyle>(
      // Light icons on the dark band (light theme), dark icons on the
      // cream band (dark theme).
      value: isDark ? SystemUiOverlayStyle.dark : SystemUiOverlayStyle.light,
      child: band,
    );
  }
}

class _BannerAction extends StatelessWidget {
  const _BannerAction({
    required this.label,
    required this.busy,
    required this.onTap,
    required this.foreground,
    this.busyLabel,
  });

  final String label;
  final String? busyLabel;
  final bool busy;
  final VoidCallback onTap;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return AppTapTarget(
      child: Semantics(
        button: true,
        enabled: !busy,
        label: busy ? (busyLabel ?? label) : label,
        onTap: busy ? null : onTap,
        excludeSemantics: true,
        child: AppPressable(
          onTap: busy ? null : onTap,
          child: Container(
            constraints: const BoxConstraints(
              minHeight: AppSizes.touchTarget,
              minWidth: AppSizes.touchTarget,
            ),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.md),
            alignment: Alignment.center,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(color: foreground.withValues(alpha: 0.45)),
            ),
            child: AnimatedSwitcher(
              duration:
                  context.reduceMotion ? Duration.zero : AppMotion.footerSwitch,
              child: busy
                  ? SizedBox.square(
                      key: const ValueKey('busy'),
                      dimension: AppSizes.footerSpinner - AppSpacing.xs,
                      child: CircularProgressIndicator(
                        strokeWidth: AppSizes.footerSpinnerStroke,
                        color: foreground,
                      ),
                    )
                  : Text(
                      label,
                      key: const ValueKey('label'),
                      style: typography.bodySmall.copyWith(
                        color: foreground,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Hosts an optional [banner] above [child] and animates it in/out
/// (docs/01 §8.3 "баннер сверху"). While shown, the banner owns the
/// status-bar inset: it slides down from under the status bar and the
/// [child]'s top [MediaQuery] padding shrinks by exactly the banner's
/// visible height, so the page's top bar stays put until the banner is
/// taller than the inset and then is pushed down smoothly — no jump.
///
/// Reduce motion (`MediaQuery.disableAnimations`): the banner appears and
/// disappears instantly. [child] is never re-parented, so navigator and
/// scroll state survive the banner toggling.
class AppTopBannerSlot extends StatefulWidget {
  const AppTopBannerSlot({
    required this.child,
    super.key,
    this.banner,
  });

  /// The banner to show, or null to hide it.
  final Widget? banner;
  final Widget child;

  @override
  State<AppTopBannerSlot> createState() => _AppTopBannerSlotState();
}

class _AppTopBannerSlotState extends State<AppTopBannerSlot>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: AppMotion.bannerEnter,
    reverseDuration: AppMotion.bannerExit,
  )..addStatusListener(_onStatus);

  late final CurvedAnimation _curve = CurvedAnimation(
    parent: _controller,
    curve: AppMotion.enterCurve,
    reverseCurve: AppMotion.exitCurve,
  );

  /// The banner currently on screen — kept during the exit animation after
  /// [AppTopBannerSlot.banner] became null.
  Widget? _shown;
  double _bannerHeight = 0;
  bool _initialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) return;
    _initialized = true;
    if (widget.banner != null) _show(widget.banner!);
  }

  @override
  void didUpdateWidget(covariant AppTopBannerSlot oldWidget) {
    super.didUpdateWidget(oldWidget);
    final banner = widget.banner;
    if (banner != null) {
      _show(banner);
    } else if (oldWidget.banner != null) {
      _hide();
    }
  }

  void _show(Widget banner) {
    _shown = banner;
    if (context.reduceMotion) {
      _controller.value = 1;
    } else if (_controller.status != AnimationStatus.forward &&
        _controller.value < 1) {
      _controller.forward();
    }
  }

  void _hide() {
    if (context.reduceMotion) {
      _controller.value = 0;
      _shown = null;
    } else {
      _controller.reverse();
    }
  }

  void _onStatus(AnimationStatus status) {
    if (status == AnimationStatus.dismissed && widget.banner == null) {
      setState(() => _shown = null);
    }
  }

  void _onBannerSize(Size size) {
    if (!mounted || size.height == _bannerHeight) return;
    setState(() => _bannerHeight = size.height);
  }

  @override
  void dispose() {
    _curve.dispose();
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final media = MediaQuery.of(context);
    return AnimatedBuilder(
      animation: _curve,
      builder: (context, _) {
        final shown = _shown;
        final visible = shown == null ? 0.0 : _bannerHeight * _curve.value;
        return Column(
          children: [
            SizedBox(
              height: visible,
              width: double.infinity,
              child: shown == null
                  ? null
                  : ClipRect(
                      child: OverflowBox(
                        alignment: Alignment.bottomCenter,
                        minHeight: 0,
                        maxHeight: double.infinity,
                        child: _SizeReporter(
                          onSize: _onBannerSize,
                          child: shown,
                        ),
                      ),
                    ),
            ),
            Expanded(
              child: MediaQuery(
                data: media.copyWith(
                  padding: media.padding.copyWith(
                    top: math.max(0, media.padding.top - visible),
                  ),
                  viewPadding: media.viewPadding.copyWith(
                    top: math.max(0, media.viewPadding.top - visible),
                  ),
                ),
                child: widget.child,
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Reports its child's laid-out size after the frame (never mid-layout).
class _SizeReporter extends SingleChildRenderObjectWidget {
  const _SizeReporter({required this.onSize, required Widget super.child});

  final ValueChanged<Size> onSize;

  @override
  _RenderSizeReporter createRenderObject(BuildContext context) =>
      _RenderSizeReporter(onSize);

  @override
  void updateRenderObject(
    BuildContext context,
    _RenderSizeReporter renderObject,
  ) {
    renderObject.onSize = onSize;
  }
}

class _RenderSizeReporter extends RenderProxyBox {
  _RenderSizeReporter(this.onSize);

  ValueChanged<Size> onSize;
  Size? _reported;

  @override
  void performLayout() {
    super.performLayout();
    if (_reported == size) return;
    _reported = size;
    final reported = size;
    SchedulerBinding.instance.addPostFrameCallback((_) => onSize(reported));
    SchedulerBinding.instance.ensureVisualUpdate();
  }
}
