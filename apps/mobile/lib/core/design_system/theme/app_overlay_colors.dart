import 'package:flutter/painting.dart';

/// Owner row 95 (2026-11-13): the fixed colours of the long-press menu and
/// the story zoom. Theme-independent on purpose, as in the references.
abstract final class AppOverlayColors {
  /// The dim behind the long-press menu: `CupertinoContextMenu`'s
  /// `_kModalBarrierColor` (`cupertino/context_menu.dart`, BSD-3).
  static const Color contextMenuBarrier = Color(0x6604040F);

  /// The story viewer's black: the frame that zooms out of a story ring.
  static const Color storyBackdrop = Color(0xFF000000);
}
