import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/core/session/guest_mode.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/desktop_cases.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// Desktop web plan 2026-10-28 §6.1: the feed, and from a 1280 window a
/// side pane at its end — the nearest deadlines and the person's active
/// cases. Under the desktop width (and for a guest, who has neither) the
/// feed is returned as it is.
class FeedAdaptivePage extends ConsumerWidget {
  const FeedAdaptivePage({required this.feed, super.key});

  final Widget feed;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!isDesktopWindow(context)) return feed;
    if (ref.watch(isGuestProvider)) {
      return ContentColumn(maxWidth: kShellContentMaxWidth, child: feed);
    }
    return SupportingPaneLayout(
      main: feed,
      pane: const FeedSidePane(),
      mainMaxWidth: kShellContentMaxWidth,
    );
  }
}

/// How many rows each section of the pane shows.
const int kFeedPaneRows = 4;

/// The pane itself: the planner's nearest dated tasks, and the active
/// cases (a client's own, or an attorney's in-work ones). Both lists are
/// the ones Mine already loads — no query of its own.
class FeedSidePane extends ConsumerWidget {
  const FeedSidePane({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);

    final tasks = ref
            .watch(mergedTasksProvider((done: false, mine: false)))
            .value
            ?.where((x) => x.nextDueAt != null)
            .take(kFeedPaneRows)
            .toList() ??
        const <TaskItem>[];

    final attorney = ref.watch(actsAsAttorneyProvider);
    final cases = <({String title, DateTime? at, String route})>[];
    if (attorney) {
      final items = ref
          .watch(
            mineWorkProvider(
              (filter: WorkFilter.active, search: const MineSearch()),
            ),
          )
          .value
          ?.items;
      for (final w in (items ?? const <WorkItem>[]).take(kFeedPaneRows)) {
        cases.add(
          (
            title: w.title,
            at: w.acceptedAt,
            route: AppRoutes.workCase(w.caseId),
          ),
        );
      }
    } else {
      final items = ref
          .watch(
            mineCasesProvider(
              (filter: MyCasesFilter.active, search: const MineSearch()),
            ),
          )
          .value
          ?.items;
      for (final c in (items ?? const <CaseSummary>[]).take(kFeedPaneRows)) {
        cases.add(
          (
            title: c.title,
            at: c.lastActivityAt,
            route: AppRoutes.myCase(c.id),
          ),
        );
      }
    }

    Widget header(String text) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.sm),
          child: Text(
            text,
            style: type.titleMedium.copyWith(color: colors.text),
          ),
        );

    Widget row({
      required String title,
      required DateTime? at,
      VoidCallback? onTap,
    }) =>
        HoverSurface(
          clickable: onTap != null,
          borderRadius: BorderRadius.circular(AppRadii.card),
          child: InkWell(
            onTap: onTap,
            borderRadius: BorderRadius.circular(AppRadii.card),
            child: Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.sm,
                vertical: AppSpacing.sm,
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      title,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(color: colors.text),
                    ),
                  ),
                  if (at != null) ...[
                    const SizedBox(width: AppSpacing.sm),
                    Text(
                      formats.dayMonth(at),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ],
              ),
            ),
          ),
        );

    return DecoratedBox(
      key: const ValueKey('desktop-feed-pane'),
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(left: BorderSide(color: colors.border)),
      ),
      child: Material(
        type: MaterialType.transparency,
        child: ListView(
          padding: const EdgeInsets.all(AppSpacing.lg),
          children: [
            if (tasks.isNotEmpty) ...[
              header(t.t('deadline.title')),
              for (final x in tasks) row(title: x.title, at: x.nextDueAt),
              const SizedBox(height: AppSpacing.lg),
            ],
            if (cases.isNotEmpty) ...[
              header(t.t('mine.tab.cases')),
              for (final c in cases)
                row(
                  title: c.title,
                  at: c.at,
                  onTap: () => openCaseRoute(context, c.route),
                ),
            ],
          ],
        ),
      ),
    );
  }
}
