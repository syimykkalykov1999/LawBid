import 'dart:math' as math;

import 'package:flutter/widgets.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';

/// Owner 2026-10-16 (web): the sizes of instagram.com / threads.com.
///
/// Measured in Chromium at 1280 and 1440 px (logged-out pages, 2026-10-16):
/// - Instagram profile: 935 px wide container, three tiles of 311 x 414
///   (3:4) with a 1 px gap, avatar 150 px.
/// - Instagram reel page: video pane 337 x 599 (9:16) inside a 673 x 601
///   frame.
/// - Instagram feed (needs a login, so not measured here): the post column
///   is 470 px, the photo 468 px wide.
/// - Threads: column 640 px, avatar 36 px, text 15 / 21 px at 48 px from the
///   column edge (542 px wide), media at most 542 x 430.
const double kWebPostMaxWidth = 470;

/// Owner 2026-10-16: a text post (a brief) is as wide as a photo post, one
/// column (Threads itself is 640 px).
const double kWebBriefMaxWidth = kWebPostMaxWidth;

/// The profile grid: three 3:4 tiles with a 1 px gap (Instagram).
const double kWebGridGap = 1;
const double kWebGridTileAspect = 3 / 4;

/// Centres [child] in a column [maxWidth] wide when the web layout is on;
/// phones and tablets keep full width.
class WebMediaWidth extends StatelessWidget {
  const WebMediaWidth({required this.maxWidth, required this.child, super.key});

  final double maxWidth;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!adaptiveShellOn) return child;
    return LayoutBuilder(
      builder: (context, c) {
        if (c.maxWidth <= maxWidth) return child;
        // The cards size their photos from MediaQuery: tell them the
        // column's width, not the window's.
        final mq = MediaQuery.of(context);
        return Align(
          alignment: Alignment.topCenter,
          child: SizedBox(
            width: maxWidth,
            child: MediaQuery(
              data: mq.copyWith(size: Size(maxWidth, mq.size.height)),
              child: child,
            ),
          ),
        );
      },
    );
  }
}

/// A reel page in a window wider than a phone: a 9:16 card as tall as the
/// window minus 16 px above and below, 8 px rounded, centred on the page
/// colour (instagram.com/reels at 1300 px: ~635 x 1268).
class WebReelFrame extends StatelessWidget {
  const WebReelFrame({required this.child, super.key});

  final Widget child;

  static const double margin = 16;
  static const double radius = 8;

  @override
  Widget build(BuildContext context) {
    if (!adaptiveShellOn) return child;
    return LayoutBuilder(
      builder: (context, c) {
        if (!c.hasBoundedHeight) return child;
        final room = c.maxHeight - 2 * margin;
        // As wide as 9:16 asks for the window's height, but never wider than
        // the column leaves; the height follows the width.
        final w = math.min(room * 9 / 16, c.maxWidth - 2 * margin);
        final h = w * 16 / 9;
        if (room <= 0 || w <= 0 || c.maxWidth <= 0) return child;
        // A phone-width window keeps the full-screen reel.
        if (c.maxWidth <= room * 9 / 16 + 2 * margin && c.maxWidth < 520) {
          return child;
        }
        return Center(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(radius),
            child: ColoredBox(
              color: const Color(0xFF000000),
              child: SizedBox(width: w, height: h, child: child),
            ),
          ),
        );
      },
    );
  }
}

/// The backdrop behind the reels: black on a phone, the page's own colour on
/// the web where only the 9:16 player is black (instagram.com/reels).
Color reelsBackdrop(BuildContext context, Color pageColor) =>
    adaptiveShellOn ? pageColor : const Color(0xFF000000);
