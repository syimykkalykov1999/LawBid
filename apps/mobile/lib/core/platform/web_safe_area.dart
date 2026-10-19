import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:lawbid/core/platform/web_safe_area_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/web_safe_area_web.dart'
    as impl;

/// Owner 2026-10-18 (iPhone web): Flutter in the browser reports no safe
/// area, so on an iPhone the header slid under the notch and the bottom bar
/// under Safari's toolbar / the home indicator. This reads the browser's
/// own insets and hands them to every SafeArea below, as the app gets them
/// from iOS. Outside the browser it changes nothing.
class WebSafeArea extends StatefulWidget {
  const WebSafeArea({required this.child, super.key});

  final Widget child;

  @override
  State<WebSafeArea> createState() => _WebSafeAreaState();
}

class _WebSafeAreaState extends State<WebSafeArea> {
  EdgeInsets? _insets;
  void Function()? _stop;

  @override
  void initState() {
    super.initState();
    _insets = impl.readSafeAreaInsets();
    if (_insets != null) _stop = impl.onViewportChange(_refresh);
  }

  void _refresh() {
    // Safari settles its bars a moment after the resize event.
    Future<void>.delayed(const Duration(milliseconds: 120), () {
      if (!mounted) return;
      final next = impl.readSafeAreaInsets();
      if (next != _insets) setState(() => _insets = next);
    });
  }

  @override
  void dispose() {
    _stop?.call();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final insets = _insets;
    if (insets == null || insets == EdgeInsets.zero) return widget.child;
    final mq = MediaQuery.of(context);
    EdgeInsets atLeast(EdgeInsets a) => EdgeInsets.fromLTRB(
          math.max(a.left, insets.left),
          math.max(a.top, insets.top),
          math.max(a.right, insets.right),
          // The keyboard covers the home indicator: no gap above it.
          mq.viewInsets.bottom > 0
              ? a.bottom
              : math.max(a.bottom, insets.bottom),
        );
    return MediaQuery(
      data: mq.copyWith(
        padding: atLeast(mq.padding),
        viewPadding: atLeast(mq.viewPadding),
      ),
      child: widget.child,
    );
  }
}
