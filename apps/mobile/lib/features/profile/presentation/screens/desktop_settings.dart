import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/core/navigation/push_once.dart';
import 'package:lawbid/core/navigation/shell/desktop_input.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/features/blocks/presentation/blocked_users_screen.dart'
    deferred as d_blocked_desktop;
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/notifications/presentation/notification_settings_screen.dart'
    deferred as d_notifications_desktop;
import 'package:lawbid/features/privacy/presentation/privacy_screen.dart'
    deferred as d_privacy_desktop;
import 'package:lawbid/features/privacy/privacy_routes.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/settings/about/about_screen.dart'
    deferred as d_about_desktop;
import 'package:lawbid/features/settings/account/account_routes.dart';
import 'package:lawbid/features/settings/account/presentation/screens/account_screen.dart'
    deferred as d_account_desktop;
import 'package:lawbid/features/settings/active_devices/presentation/active_devices_screen.dart'
    deferred as d_devices_desktop;
import 'package:lawbid/features/settings/data_export/presentation/data_export_screen.dart'
    deferred as d_export_desktop;
import 'package:lawbid/features/settings/storage/presentation/storage_screen.dart'
    deferred as d_storage_desktop;

/// Desktop web plan 2026-10-28 §6.7: on a desktop window Settings is two
/// panes — the sections list on the left (the same screen as on the phone)
/// and the open section on the right (the same list | detail shape as the
/// chats and cases pages). Under the desktop width nothing here is used: a
/// tap pushes the section as a page, as before.
class DesktopSettingsScope extends InheritedWidget {
  const DesktopSettingsScope({
    required this.selected,
    required this.open,
    required super.child,
    super.key,
  });

  /// The open section's route (`/profile/settings/devices`), null when none.
  final String? selected;
  final void Function(String location) open;

  static DesktopSettingsScope? maybeOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<DesktopSettingsScope>();

  /// Whether [context] is inside the desktop settings page.
  static bool inPage(BuildContext context) => maybeOf(context) != null;

  @override
  bool updateShouldNotify(DesktopSettingsScope oldWidget) =>
      selected != oldWidget.selected;
}

/// The sections the right pane hosts: route path → the section's screen.
/// These screens are self-contained pages (their own bar, no arguments).
/// Any other row keeps pushing its page.
final Map<String, Widget Function()> _hosted = {
  AccountRoutes.account: () => DeferredScreen(
        id: 'account_screen_desktop',
        load: d_account_desktop.loadLibrary,
        builder: (_) => d_account_desktop.AccountScreen(),
      ),
  ChatRoutes.notificationSettings: () => DeferredScreen(
        id: 'notification_settings_screen_desktop',
        load: d_notifications_desktop.loadLibrary,
        builder: (_) => d_notifications_desktop.NotificationSettingsScreen(),
      ),
  PrivacyRoutes.privacy: () => DeferredScreen(
        id: 'privacy_screen_desktop',
        load: d_privacy_desktop.loadLibrary,
        builder: (_) => d_privacy_desktop.PrivacyScreen(),
      ),
  AppRoutes.activeDevices: () => DeferredScreen(
        id: 'active_devices_screen_desktop',
        load: d_devices_desktop.loadLibrary,
        builder: (_) => d_devices_desktop.ActiveDevicesScreen(),
      ),
  AppRoutes.storage: () => DeferredScreen(
        id: 'storage_screen_desktop',
        load: d_storage_desktop.loadLibrary,
        builder: (_) => d_storage_desktop.StorageScreen(),
      ),
  AppRoutes.blockedUsers: () => DeferredScreen(
        id: 'blocked_users_screen_desktop',
        load: d_blocked_desktop.loadLibrary,
        builder: (_) => d_blocked_desktop.BlockedUsersScreen(),
      ),
  AppRoutes.dataExport: () => DeferredScreen(
        id: 'data_export_screen_desktop',
        load: d_export_desktop.loadLibrary,
        builder: (_) => d_export_desktop.DataExportScreen(),
      ),
  AppRoutes.about: () => DeferredScreen(
        id: 'about_screen_desktop',
        load: d_about_desktop.loadLibrary,
        builder: (_) => d_about_desktop.AboutScreen(),
      ),
};

/// Whether the right pane can show the page at [location].
bool isHostedSettingsRoute(String location) =>
    _hosted.containsKey(Uri.parse(location).path);

/// Opens a Settings row's page: in the right pane on the desktop page (for
/// the sections it hosts), pushed as a page everywhere else. [once] keeps
/// the push from stacking twice on a double tap.
void openSettingsRoute(
  BuildContext context,
  String location, {
  bool once = false,
}) {
  final scope = DesktopSettingsScope.maybeOf(context);
  if (scope != null && isHostedSettingsRoute(location)) {
    scope.open(location);
  } else if (once) {
    context.pushOnce(location);
  } else {
    context.push(location);
  }
}

/// The desktop Settings page itself: sections | the open section.
class DesktopSettingsPage extends StatefulWidget {
  const DesktopSettingsPage({super.key});

  @override
  State<DesktopSettingsPage> createState() => _DesktopSettingsPageState();
}

class _DesktopSettingsPageState extends State<DesktopSettingsPage> {
  String? _location;

  void _open(String location) {
    final path = Uri.parse(location).path;
    if (path != _location) setState(() => _location = path);
  }

  @override
  Widget build(BuildContext context) {
    final location = _location;
    return DesktopSettingsScope(
      selected: location,
      open: _open,
      child: DesktopKeyBindings(
        onEscape: () {
          if (location == null) return false;
          setState(() => _location = null);
          return true;
        },
        child: ListDetailLayout(
          list: const SettingsScreen(),
          detail: location == null
              ? const _EmptySettingsPane()
              : ContentColumn(
                  maxWidth: kSettingsDetailMaxWidth,
                  child: _SectionPane(
                    key: ValueKey('desktop-settings-$location'),
                    location: location,
                  ),
                ),
        ),
      ),
    );
  }
}

/// A section's screen in a navigator of its own: the screen's back arrow
/// pops its page, and here there is nothing to pop, so it does nothing
/// instead of leaving Settings.
class _SectionPane extends StatelessWidget {
  const _SectionPane({required this.location, super.key});

  final String location;

  @override
  Widget build(BuildContext context) {
    final build = _hosted[location];
    if (build == null) return const SizedBox.shrink();
    return Navigator(
      onGenerateRoute: (_) => PageRouteBuilder<void>(
        transitionDuration: Duration.zero,
        reverseTransitionDuration: Duration.zero,
        pageBuilder: (_, __, ___) => build(),
      ),
    );
  }
}

/// The right pane while no section is open.
class _EmptySettingsPane extends ConsumerWidget {
  const _EmptySettingsPane();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return Material(
      key: const ValueKey('desktop-settings-empty'),
      color: colors.bg,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIcon(
              AppIcons.settingsOutlined,
              size: 72,
              color: colors.textSecondary,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('settings.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
          ],
        ),
      ),
    );
  }
}
