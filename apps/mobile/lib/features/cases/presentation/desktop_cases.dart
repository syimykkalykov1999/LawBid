import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/deferred_screen.dart';
import 'package:lawbid/core/navigation/shell/desktop_input.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/features/cases/presentation/screens/owner_case_screen.dart';
import 'package:lawbid/features/cases/presentation/screens/work_case_screen.dart'
    deferred as d_work_case_desktop;
import 'package:lawbid/features/mine/presentation/screens/mine_screen.dart';

/// Desktop web plan 2026-10-28 §6.4: on a desktop window «Mine» is two
/// panes — the cases list on the left and the open case on the right (the
/// same list | detail shape as the chats page). Under the desktop width
/// nothing here is used: a tap pushes the case page as before.
class DesktopCaseScope extends InheritedWidget {
  const DesktopCaseScope({
    required this.selected,
    required this.open,
    required this.close,
    required super.child,
    super.key,
  });

  /// The open case's page location (`/mine/case/:id`), null when none.
  final String? selected;
  final void Function(String location) open;
  final VoidCallback close;

  static DesktopCaseScope? maybeOf(BuildContext context) =>
      context.getInheritedWidgetOfExactType<DesktopCaseScope>();

  /// Whether [context] is inside the desktop cases page.
  static bool inPage(BuildContext context) => maybeOf(context) != null;

  @override
  bool updateShouldNotify(DesktopCaseScope oldWidget) =>
      selected != oldWidget.selected;
}

/// Opens a case page from a list: in the right pane on the desktop page,
/// pushed as a page everywhere else.
void openCaseRoute(BuildContext context, String location) {
  final scope = DesktopCaseScope.maybeOf(context);
  if (scope != null) {
    scope.open(location);
  } else {
    context.push(location);
  }
}

/// A case page's back arrow / «closed» exit. On the desktop page the right
/// pane empties; elsewhere [fallback] runs (the pop of a pushed page).
void closeCaseRoute(BuildContext context, VoidCallback fallback) {
  final scope = DesktopCaseScope.maybeOf(context);
  if (scope != null) {
    scope.close();
  } else {
    fallback();
  }
}

/// The route for `/mine/case/:id` and `/mine/work/:id`: on a desktop window
/// the two-pane cases page with that case open, else [phone] as it was.
class CasesAdaptivePage extends StatelessWidget {
  const CasesAdaptivePage({
    required this.location,
    required this.phone,
    super.key,
  });

  final String location;
  final Widget phone;

  @override
  Widget build(BuildContext context) {
    if (!isDesktopWindow(context)) return phone;
    return DesktopCasesPage(initial: location, pushedPage: true);
  }
}

/// The desktop cases page itself («Mine» tab, and a case opened by a link).
class DesktopCasesPage extends StatefulWidget {
  const DesktopCasesPage({this.initial, this.pushedPage = false, super.key});

  /// The case open first (null: the empty pane).
  final String? initial;

  /// Opened as a page of its own (a link): closing the case goes back to
  /// the Mine tab instead of just emptying the pane.
  final bool pushedPage;

  @override
  State<DesktopCasesPage> createState() => _DesktopCasesPageState();
}

class _DesktopCasesPageState extends State<DesktopCasesPage> {
  String? _location;

  @override
  void initState() {
    super.initState();
    _location = widget.initial;
  }

  void _open(String location) {
    if (location != _location) setState(() => _location = location);
  }

  void _close() {
    if (widget.pushedPage) {
      context.go(AppRoutes.mine);
    } else if (_location != null) {
      setState(() => _location = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final location = _location;
    return DesktopCaseScope(
      selected: location,
      open: _open,
      close: _close,
      child: DesktopKeyBindings(
        onEscape: () {
          if (location == null) return false;
          _close();
          return true;
        },
        child: ListDetailLayout(
          listWidth: kCaseListPaneWidth,
          list: const MineScreen(),
          detail: location == null
              ? const _EmptyCasePane()
              : ContentColumn(
                  maxWidth: kCaseDetailMaxWidth,
                  child: KeyedSubtree(
                    key: ValueKey('desktop-case-$location'),
                    child: _CaseDetail(location: location),
                  ),
                ),
        ),
      ),
    );
  }
}

/// The screen of a case page's [location].
class _CaseDetail extends StatelessWidget {
  const _CaseDetail({required this.location});

  final String location;

  @override
  Widget build(BuildContext context) {
    final parts = location.split('/');
    final id = Uri.decodeComponent(parts.last);
    if (parts.length > 2 && parts[2] == 'work') {
      return DeferredScreen(
        id: 'work_case_screen_desktop',
        load: d_work_case_desktop.loadLibrary,
        builder: (_) => d_work_case_desktop.WorkCaseScreen(caseId: id),
      );
    }
    return OwnerCaseScreen(caseId: id);
  }
}

/// The right pane while no case is open.
class _EmptyCasePane extends ConsumerWidget {
  const _EmptyCasePane();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return Material(
      key: const ValueKey('desktop-case-empty'),
      color: colors.bg,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIcon(
              AppIcons.folderOpenRounded,
              size: 72,
              color: colors.textSecondary,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('mine.tab.cases'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
          ],
        ),
      ),
    );
  }
}
