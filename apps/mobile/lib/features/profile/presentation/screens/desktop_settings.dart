import 'package:flutter/foundation.dart' show mapEquals;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/hosted_settings_sections.dart';
import 'package:lawbid/core/navigation/push_once.dart';
import 'package:lawbid/core/navigation/shell/desktop_input.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';

/// Desktop web plan 2026-10-28 §6.7: on a desktop window Settings is two
/// panes — the sections list on the left (the same screen as on the phone)
/// and the open section on the right (the same list | detail shape as the
/// chats and cases pages). Under the desktop width nothing here is used: a
/// tap pushes the section as a page, as before.
class DesktopSettingsScope extends InheritedWidget {
  const DesktopSettingsScope({
    required this.open,
    required super.child,
    super.key,
  });

  /// Shows a section: navigates to its address, so the section is in the
  /// URL, survives a refresh, and the browser's back button closes it.
  final void Function(String location) open;

  static DesktopSettingsScope? maybeOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<DesktopSettingsScope>();

  /// Whether [context] is inside the desktop settings page.
  static bool inPage(BuildContext context) => maybeOf(context) != null;

  @override
  bool updateShouldNotify(DesktopSettingsScope oldWidget) => false;
}

/// Whether the right pane can show the page at [location].
bool isHostedSettingsRoute(String location) =>
    hostedSettingsSections.containsKey(Uri.parse(location).path);

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

/// The route for `/profile/settings/<section>`: on a desktop window the
/// two-pane Settings page with that section open, else [phone] as it was.
class SettingsSectionPage extends StatelessWidget {
  const SettingsSectionPage({
    required this.location,
    required this.phone,
    this.query = const {},
    super.key,
  });

  final String location;
  final Widget phone;

  /// The address's query (e.g. `?tab=receipts` on Payments), kept for the
  /// section shown in the right pane.
  final Map<String, String> query;

  @override
  Widget build(BuildContext context) {
    if (!isDesktopWindow(context)) return phone;
    return DesktopSettingsPage(location: location, query: query);
  }
}

/// The desktop Settings page itself: sections | the open section. The open
/// section is the page's address ([location], null on `/profile/settings`).
class DesktopSettingsPage extends StatelessWidget {
  const DesktopSettingsPage({this.location, this.query = const {}, super.key});

  final String? location;
  final Map<String, String> query;

  void _open(BuildContext context, String target) {
    final uri = Uri.parse(target);
    final path = uri.path;
    if (path == location && mapEquals(uri.queryParameters, query)) {
      return;
    }
    final next = uri.hasQuery ? '$path?${uri.query}' : path;
    // From the bare list a section is pushed (back closes it); from one
    // section to another it replaces, so back does not walk every click.
    if (location == null) {
      context.push(next);
    } else {
      context.replace(next);
    }
  }

  @override
  Widget build(BuildContext context) {
    final open = location;
    return DesktopSettingsScope(
      open: (target) => _open(context, target),
      child: DesktopKeyBindings(
        onEscape: () {
          if (open == null) return false;
          context.canPop()
              ? context.pop()
              : context.go(AppRoutes.profileSettings);
          return true;
        },
        child: ListDetailLayout(
          list: const SettingsScreen(),
          detail: open == null
              ? const _EmptySettingsPane()
              : ContentColumn(
                  maxWidth: kSettingsDetailMaxWidth,
                  child: _SectionPane(
                    key: ValueKey('desktop-settings-$open-$query'),
                    location: open,
                    query: query,
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
  const _SectionPane({required this.location, required this.query, super.key});

  final String location;
  final Map<String, String> query;

  @override
  Widget build(BuildContext context) {
    final build = hostedSettingsSections[location];
    if (build == null) return const SizedBox.shrink();
    return Navigator(
      onGenerateRoute: (_) => PageRouteBuilder<void>(
        transitionDuration: Duration.zero,
        reverseTransitionDuration: Duration.zero,
        pageBuilder: (_, __, ___) => build(query),
      ),
    );
  }
}

/// The empty pane's icon (the cases page uses the same size).
const double _kEmptyIconSize = 72;

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
              size: _kEmptyIconSize,
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
