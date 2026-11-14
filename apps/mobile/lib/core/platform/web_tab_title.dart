import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/session/session_providers.dart';

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

final webTabUnreadProvider =
    NotifierProvider<WebTabUnread, int>(WebTabUnread.new);

/// The tab's text for [unread] items: «(3) LawBid», or just the name.
String webTabTitle(String appName, int unread) =>
    unread > 0 ? '($unread) $appName' : appName;

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
    if (!kIsWeb) return child;
    // Signed out: the name only (the shell that wrote the number is gone).
    final signedOut =
        ref.watch(sessionControllerProvider.select((s) => s == null));
    final unread = signedOut ? 0 : ref.watch(webTabUnreadProvider);
    return Title(
      title: webTabTitle(appName, unread),
      color: color,
      child: child,
    );
  }
}
