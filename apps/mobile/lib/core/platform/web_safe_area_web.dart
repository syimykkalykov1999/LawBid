import 'dart:js_interop';

import 'package:flutter/widgets.dart';
import 'package:web/web.dart' as web;

web.HTMLDivElement? _probe;

/// The browser's `env(safe-area-inset-*)`: the notch, the home indicator and
/// Safari's floating toolbar on an iPhone, in CSS pixels.
EdgeInsets? readSafeAreaInsets() {
  final probe =
      _probe ??= (web.document.createElement('div') as web.HTMLDivElement)
        ..style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;'
            'visibility:hidden;pointer-events:none;'
            'padding-top:env(safe-area-inset-top);'
            'padding-right:env(safe-area-inset-right);'
            'padding-bottom:env(safe-area-inset-bottom);'
            'padding-left:env(safe-area-inset-left);';
  if (!probe.isConnected) web.document.body?.append(probe);
  final s = web.window.getComputedStyle(probe);
  double px(String v) => double.tryParse(v.replaceAll('px', '')) ?? 0;
  return EdgeInsets.fromLTRB(
    px(s.paddingLeft),
    px(s.paddingTop),
    px(s.paddingRight),
    px(s.paddingBottom),
  );
}

/// Calls [listener] when the window's size or orientation changes; returns
/// the function that stops it.
void Function() onViewportChange(VoidCallback listener) {
  final js = ((web.Event _) => listener()).toJS;
  web.window.addEventListener('resize', js);
  web.window.addEventListener('orientationchange', js);
  return () {
    web.window.removeEventListener('resize', js);
    web.window.removeEventListener('orientationchange', js);
  };
}
