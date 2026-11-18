import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/platform/web_favicon_badge_stub.dart'
    if (dart.library.js_interop) 'package:lawbid/core/platform/web_favicon_badge_web.dart'
    as favicon;
import 'package:lawbid/core/session/session_providers.dart';
import 'package:material_ui/material_ui.dart';

/// Owner row 113 (2026-11-14, like Telegram Web «(3) Telegram» and WhatsApp
/// Web «(5) WhatsApp»): on the website the browser tab shows the number of
/// unread chats + notifications before the app's name.
///
/// The signed-in shell writes the number (it already keeps the badges
/// alive); nothing here starts the badges, the socket or a request, so a
/// guest or a signed-out page stays «LawBid».
class WebTabUnread extends Notifier<int> {
  @override
  int build() => 0;

  // ignore: use_setters_to_change_properties
  void set(int n) => state = n < 0 ? 0 : n;
}

final webTabUnreadProvider = NotifierProvider<WebTabUnread, int>(
  WebTabUnread.new,
);

/// The tab's text for [unread] items: «(3) LawBid», or just the name.
String webTabTitle(String appName, int unread) =>
    unread > 0 ? '($unread) $appName' : appName;

/// Tests switch the website branch on (kIsWeb is false under flutter test).
@visibleForTesting
bool? debugWebTabTitleOverride;

/// Tests record the badge instead of drawing it.
@visibleForTesting
void Function(int count, {required String background, required String color})?
    debugFaviconBadgeSetter;

bool get _onWeb => debugWebTabTitleOverride ?? kIsWeb;

/// `#RRGGBB` for the canvas Tinycon draws on.
String _hex(Color c) =>
    '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';

/// Sits in `MaterialApp.builder`, below the app's own [Title], so it is
/// built after it on every app rebuild and its text wins. Phones: nothing
/// changes (the task-switcher label stays the app's name).
class WebTabTitle extends ConsumerWidget {
  const WebTabTitle({
    required this.appName,
    required this.color,
    required this.child,
    super.key,
  });

  final String appName;
  final Color color;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!_onWeb) return child;
    // Signed out: the name only (the shell that wrote the number is gone).
    final signedOut = ref.watch(
      sessionControllerProvider.select((s) => s == null),
    );
    final unread = signedOut ? 0 : ref.watch(webTabUnreadProvider);
    // The tab icon gets the same number in the app's own unread pill
    // colours (gold, navy text; inbox CountPill) — Telegram / WhatsApp Web.
    final tokens = Theme.of(context).extension<AppColorTokens>();
    return _FaviconBadge(
      count: unread,
      background: _hex(tokens?.gold ?? color),
      foreground: _hex(tokens?.navy ?? color),
      child: Title(
        title: webTabTitle(appName, unread),
        color: color,
        child: child,
      ),
    );
  }
}

/// Draws [count] on the tab icon when it changes (0: the plain icon).
class _FaviconBadge extends StatefulWidget {
  const _FaviconBadge({
    required this.count,
    required this.background,
    required this.foreground,
    required this.child,
  });

  final int count;
  final String background;
  final String foreground;
  final Widget child;

  @override
  State<_FaviconBadge> createState() => _FaviconBadgeState();
}

class _FaviconBadgeState extends State<_FaviconBadge> {
  @override
  void initState() {
    super.initState();
    // Nothing to draw on a fresh page: the icon is already plain.
    if (widget.count > 0) _draw();
  }

  @override
  void didUpdateWidget(_FaviconBadge old) {
    super.didUpdateWidget(old);
    if (old.count != widget.count) _draw();
  }

  void _draw() => (debugFaviconBadgeSetter ?? favicon.setFaviconBadge)(
        widget.count,
        background: widget.background,
        color: widget.foreground,
      );

  @override
  Widget build(BuildContext context) => widget.child;
}
