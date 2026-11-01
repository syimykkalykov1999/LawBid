import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_side_nav.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/shared/presentation/guest_gate.dart';

/// Which of the desktop-only menu items the page on screen is.
enum DesktopNavSection { messages, notifications }

/// The chats page, `/inbox?tab=notifications` for the notifications list.
const String kDesktopInboxLocation = '/inbox';
const String kDesktopNotificationsLocation = '/inbox?tab=notifications';

/// Desktop web plan 2026-10-28 §5.2 (owner Q1: yes): the side menu of a
/// desktop window — the four tabs and «+» plus Messages and Notifications
/// with their counts. Only this menu watches the counts, so a new message
/// repaints the menu, not the shell or the page next to it. The counts
/// come from the badges the app already keeps (no request of its own).
class DesktopSideNav extends ConsumerWidget {
  const DesktopSideNav({
    required this.tabs,
    required this.currentIndex,
    required this.onTabSelected,
    required this.onCreatePressed,
    required this.extended,
    required this.createLabel,
    this.current,
    super.key,
  });

  final List<AppTabConfig> tabs;
  final int currentIndex;
  final ValueChanged<int> onTabSelected;
  final VoidCallback onCreatePressed;
  final bool extended;
  final String createLabel;

  /// The desktop-only item open now (null: one of the tabs or another page).
  final DesktopNavSection? current;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final counts = ref.watch(
      badgesProvider.select((b) => (b.chats, b.notifications)),
    );
    return AppSideNav(
      tabs: tabs,
      currentIndex: current == null ? currentIndex : -1,
      onTabSelected: onTabSelected,
      onCreatePressed: onCreatePressed,
      extended: extended,
      createLabel: createLabel,
      messages: AppSideNavExtra(
        key: const ValueKey('side-nav-messages'),
        icon: AppIcons.chatBubbleOutlineRounded,
        activeIcon: AppIcons.chatBubbleRounded,
        label: t.t('inbox.title'),
        count: counts.$1,
        selected: current == DesktopNavSection.messages,
        onTap: () => openDesktopSection(
          context,
          ref,
          DesktopNavSection.messages,
          from: current,
        ),
      ),
      notifications: AppSideNavExtra(
        key: const ValueKey('side-nav-notifications'),
        icon: AppIcons.notificationsNoneRounded,
        activeIcon: AppIcons.notificationsRounded,
        label: t.t('inbox.tab.notifications'),
        count: counts.$2,
        selected: current == DesktopNavSection.notifications,
        onTap: () => openDesktopSection(
          context,
          ref,
          DesktopNavSection.notifications,
          from: current,
        ),
      ),
    );
  }
}

/// Opens Messages or Notifications from the desktop menu. From the chats
/// page itself the page is swapped in place (no new entry in the browser's
/// history, the list keeps its place); from anywhere else it opens on top,
/// as the phone's own entry does. A guest is asked to sign in first.
void openDesktopSection(
  BuildContext context,
  WidgetRef ref,
  DesktopNavSection section, {
  DesktopNavSection? from,
}) {
  if (!requireSignIn(context, ref)) return;
  // Messages from an open chat goes back to the bare list (WhatsApp Web).
  if (section == from && section == DesktopNavSection.notifications) return;
  final location = section == DesktopNavSection.messages
      ? kDesktopInboxLocation
      : kDesktopNotificationsLocation;
  final router = GoRouter.of(context);
  if (from != null) {
    Router.neglect(context, () => router.replace<void>(location));
  } else {
    router.push<void>(location);
  }
}
