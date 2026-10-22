import 'package:flutter/widgets.dart';

/// Owner 2026-10-22 (audit #12, WCAG 1.4.4 / Apple Dynamic Type): the app
/// shell follows the phone's font-size setting up to [shellMax] (1.3×) so
/// cards, bars and sheets keep their shape. Reading text — a chat message,
/// a post's caption — wraps in [FullTextScale] and follows the setting in
/// full, so people with low vision can read what matters.
class DeviceTextScale extends InheritedWidget {
  const DeviceTextScale({
    required this.scaler,
    required super.child,
    super.key,
  });

  /// Smallest and largest factor of the app shell.
  static const double shellMin = 0.9;
  static const double shellMax = 1.3;

  /// The phone's own setting, before the shell's cap.
  final TextScaler scaler;

  static TextScaler? maybeOf(BuildContext context) =>
      context.dependOnInheritedWidgetOfExactType<DeviceTextScale>()?.scaler;

  /// Installs the phone's setting for [FullTextScale] and caps everything
  /// below at [shellMin]–[shellMax].
  static Widget shell(BuildContext context, {required Widget child}) {
    final media = MediaQuery.of(context);
    return DeviceTextScale(
      scaler: media.textScaler,
      child: MediaQuery(
        data: media.copyWith(
          textScaler: media.textScaler.clamp(
            minScaleFactor: shellMin,
            maxScaleFactor: shellMax,
          ),
        ),
        child: child,
      ),
    );
  }

  @override
  bool updateShouldNotify(DeviceTextScale oldWidget) =>
      oldWidget.scaler != scaler;
}

/// Text below follows the phone's font size in full (no shell cap). Without
/// a [DeviceTextScale] above (tests, previews) it changes nothing.
class FullTextScale extends StatelessWidget {
  const FullTextScale({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final full = DeviceTextScale.maybeOf(context);
    if (full == null) return child;
    return MediaQuery(
      data: MediaQuery.of(context).copyWith(textScaler: full),
      child: child,
    );
  }
}
