import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';

/// Desktop web plan 2026-10-28 §7: «list | detail» side by side (WhatsApp
/// Web, Telegram Web). Each pane is a small phone of its own: the screens
/// inside see the pane's width as the screen's, so they lay out as they do
/// on a phone. Under the desktop width only [detail] is drawn — the screen
/// stays exactly as it is today.
class ListDetailLayout extends StatelessWidget {
  const ListDetailLayout({
    required this.list,
    required this.detail,
    this.listWidth = kChatListPaneWidth,
    this.wideListWidth = kChatListPaneWideWidth,
    super.key,
  });

  final Widget list;
  final Widget detail;

  /// The list's width on a desktop window, and from 1440.
  final double listWidth;
  final double wideListWidth;

  @override
  Widget build(BuildContext context) {
    final window = windowClassOf(context);
    if (!window.isDesktop) return detail;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final width = window == WindowClass.desktopWide ? wideListWidth : listWidth;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        SizedBox(
          width: width,
          // A new message in the open chat does not repaint the list.
          child: RepaintBoundary(child: ContentColumn(child: list)),
        ),
        ColoredBox(color: colors.border, child: const SizedBox(width: 1)),
        Expanded(child: RepaintBoundary(child: ContentColumn(child: detail))),
      ],
    );
  }
}

/// Desktop web plan §7: the main content plus a side pane at the end (the
/// feed's «upcoming deadlines», a case's summary). The pane shows only on
/// a window at least [paneMinWidth] wide; narrower, [main] alone.
class SupportingPaneLayout extends StatelessWidget {
  const SupportingPaneLayout({
    required this.main,
    required this.pane,
    this.paneWidth = 320,
    this.mainMaxWidth,
    this.paneMinWidth = 1280,
    super.key,
  });

  final Widget main;
  final Widget pane;
  final double paneWidth;

  /// The widest the main content gets (null: all the free width).
  final double? mainMaxWidth;

  /// The narrowest window that shows the pane.
  final double paneMinWidth;

  @override
  Widget build(BuildContext context) {
    final view = View.maybeOf(context);
    final windowWidth =
        view == null ? 0.0 : view.physicalSize.width / view.devicePixelRatio;
    if (!isDesktopWindow(context) || windowWidth < paneMinWidth) return main;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(child: ContentColumn(maxWidth: mainMaxWidth, child: main)),
        SizedBox(width: paneWidth, child: RepaintBoundary(child: pane)),
      ],
    );
  }
}

/// Desktop web plan §4: text and forms never run across the whole window
/// — at most [maxWidth], centred at the top. Under the desktop width the
/// child is returned as it is.
class ReadableWidth extends StatelessWidget {
  const ReadableWidth({required this.child, this.maxWidth = 680, super.key});

  final double maxWidth;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    if (!isDesktopWindow(context)) return child;
    return Align(
      alignment: Alignment.topCenter,
      child: ConstrainedBox(
        constraints: BoxConstraints(maxWidth: maxWidth),
        child: child,
      ),
    );
  }
}
