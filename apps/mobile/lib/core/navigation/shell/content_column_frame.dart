import 'dart:ui' show PlatformDispatcher;

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/navigation/shell/shell_layout.dart';

/// Window width in logical pixels, whatever [MediaQuery] says at [context].
double _windowWidth(BuildContext context) {
  final view = View.maybeOf(context) ?? PlatformDispatcher.instance.views.first;
  return view.physicalSize.width / view.devicePixelRatio;
}

bool _onAuthRoute(BuildContext context) {
  try {
    final uri = GoRouter.of(context).routeInformationProvider.value.uri;
    return isAuthLocation(uri.path);
  } on Object {
    return false;
  }
}

/// Max width for a sheet's route on web (null: the phone's own width).
BoxConstraints? contentColumnSheetConstraints(BuildContext context) {
  final w = contentColumnBounds(
    _windowWidth(context),
    auth: _onAuthRoute(context),
  ).maxWidth;
  return w == null ? null : BoxConstraints(maxWidth: w);
}

/// Puts a sheet or dialog over the content column: shifts it by half of
/// the side column (the route centres it in the window).
class ContentColumnFrame extends StatelessWidget {
  const ContentColumnFrame({required this.child, super.key});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    final b = contentColumnBounds(
      _windowWidth(context),
      auth: _onAuthRoute(context),
    );
    if (b.shift == 0) return child;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    return Transform.translate(
      offset: Offset(rtl ? -b.shift : b.shift, 0),
      child: child,
    );
  }
}
