import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/pill_tabs.dart';
import 'package:lawbid/features/cases/tools/billing_tab.dart';
import 'package:lawbid/features/cases/tools/signing_tab.dart';
import 'package:lawbid/features/cases/workspace/compose_sheet.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/cases/workspace/tasks_tab.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_tab_pages.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-13: the body of an accepted case, for the client and the
/// attorney alike — chips, title, State · Budget · Deadline and the text
/// tabs Overview | Files | Tasks | Updates | Activity. [overview] is what
/// the side shows on its own Overview tab (description, the other party's
/// card, chat).
class CaseWorkspaceBody extends ConsumerStatefulWidget {
  const CaseWorkspaceBody({
    required this.caseId,
    required this.isAttorney,
    required this.chips,
    required this.statusLabel,
    required this.title,
    required this.states,
    required this.budget,
    required this.urgency,
    required this.overview,
    required this.onRefresh,
    required this.categoryCode,
    required this.statusTone,
    required this.stage,
    required this.publishedAt,
    super.key,
  });

  /// The case head (owner 2026-10-15): the practice colour, the status tone,
  /// the stage 0..4 and the day it was published.
  final String? categoryCode;
  final StatusTone statusTone;
  final int stage;
  final DateTime publishedAt;

  final String caseId;
  final bool isAttorney;
  final List<String> chips;
  final String statusLabel;
  final String title;
  final List<String> states;
  final CaseBudget budget;
  final CaseUrgencyInfo urgency;
  final List<Widget> overview;
  final Future<void> Function() onRefresh;

  @override
  ConsumerState<CaseWorkspaceBody> createState() => _CaseWorkspaceBodyState();
}

class _CaseWorkspaceBodyState extends ConsumerState<CaseWorkspaceBody> {
  int _tab = 0;

  void _select(int i) {
    setState(() => _tab = i);
    // Opening Updates reads them: the grey number goes away.
    if (i == 3) {
      ref
          .read(caseWorkspaceActionsProvider)
          .markUpdatesSeen(widget.caseId)
          .catchError((Object _) {});
    }
  }

  Future<void> _refresh() async {
    ref
      ..invalidate(caseWorkspaceProvider(widget.caseId))
      ..invalidate(caseFilesProvider(widget.caseId))
      ..invalidate(caseTasksProvider(widget.caseId))
      ..invalidate(caseUpdatesProvider(widget.caseId))
      ..invalidate(caseActivityProvider(widget.caseId));
    await widget.onRefresh();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final ws = ref.watch(caseWorkspaceProvider(widget.caseId)).value;
    final files = ws?.files.length ?? 0;
    final open = ws?.openTasks ?? 0;
    // On the Updates tab itself there is nothing new any more.
    final fresh = _tab == 3 ? 0 : (ws?.newUpdates ?? 0);
    return LayoutBuilder(
      builder: (context, box) {
        // Owner 2026-10-13: from 900 dp the Overview (the other party, the
        // description, chat) stays in a side column and the tabs are the
        // four working ones; on a phone it is the first tab.
        final wide = box.maxWidth >= 900;
        final tab = wide && _tab == 0 ? 2 : _tab;
        final labels = [
          if (!wide) CaseTabItem(t.t('cases.tab.overview')),
          CaseTabItem(t.t('cases.tab.files'), count: files),
          CaseTabItem(t.t('cases.tab.tasks'), count: open),
          CaseTabItem(t.t('cases.tab.updates'), count: fresh),
          CaseTabItem(t.t('cases.tab.activity')),
          CaseTabItem(t.t('cases.tab.time')),
          CaseTabItem(t.t('cases.tab.docs')),
        ];
        final shift = wide ? 1 : 0;
        // Owner 2026-10-19 (Instagram): the case header scrolls away, the
        // tab row sticks, and the tabs are pages side by side — the next
        // one slides in with the finger, a tap slides to it, each is kept.
        final pages = [for (var i = shift; i < labels.length + shift; i++) i];
        Widget pageFor(int tab) => switch (tab) {
              0 => Column(children: widget.overview),
              1 => FilesTab(
                  caseId: widget.caseId,
                  isAttorney: widget.isAttorney,
                ),
              2 => TasksTab(
                  caseId: widget.caseId,
                  isAttorney: widget.isAttorney,
                ),
              3 => UpdatesTab(
                  caseId: widget.caseId,
                  isAttorney: widget.isAttorney,
                ),
              4 => ActivityTab(caseId: widget.caseId),
              5 => BillingTab(
                  caseId: widget.caseId,
                  isAttorney: widget.isAttorney,
                ),
              _ => SigningTab(
                  caseId: widget.caseId,
                  isAttorney: widget.isAttorney,
                ),
            };
        final scale = MediaQuery.textScalerOf(context).scale(1);
        final main = ProfileTabPages(
          key: ValueKey('case-pages-$wide'),
          initialPage: (tab - shift).clamp(0, labels.length - 1),
          onPage: (i) => _select(i + shift),
          onRefresh: _refresh,
          tabBarHeight: 28 + 18 * scale,
          pagePadding: (_) => const EdgeInsets.only(bottom: AppSpacing.xxl),
          header: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              CaseHero(
                t: t,
                formats: formats,
                practiceName: widget.chips.join(' · '),
                categoryCode: widget.categoryCode,
                statusLabel: widget.statusLabel,
                statusTone: widget.statusTone,
                title: widget.title,
                states: widget.states,
                budget: widget.budget,
                urgency: widget.urgency,
                stage: widget.stage,
                publishedAt: widget.publishedAt,
              ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
          tabBar: Builder(
            builder: (context) => CaseTextTabs(
              pages: ProfileTabPages.controllerOf(context),
              items: labels,
              index: tab - shift,
              onChanged: (i) {
                final c = ProfileTabPages.controllerOf(context);
                if (c != null && c.hasClients) {
                  c.animateToPage(
                    i,
                    duration: context.reduceMotion
                        ? Duration.zero
                        : const Duration(milliseconds: 250),
                    curve: Curves.easeOutCubic,
                  );
                } else {
                  _select(i + shift);
                }
              },
            ),
          ),
          pages: [
            for (final p in pages)
              ConstrainedBox(
                constraints: BoxConstraints(
                  minHeight: MediaQuery.sizeOf(context).height * 0.5,
                ),
                child: pageFor(p),
              ),
          ],
        );
        if (!wide) return main;
        return Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 1240),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(child: main),
                Container(
                  width: 380,
                  decoration: BoxDecoration(
                    border: BorderDirectional(
                      start: BorderSide(color: colors.border),
                    ),
                  ),
                  child: SingleChildScrollView(
                    padding: const EdgeInsets.only(bottom: AppSpacing.xxl),
                    child: Column(children: widget.overview),
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// A line of text filters under the tabs ("All · Photos · ...").
class FilterRow extends StatelessWidget {
  const FilterRow({
    required this.labels,
    required this.index,
    required this.onChanged,
    super.key,
  });

  final List<String> labels;
  final int index;
  final ValueChanged<int> onChanged;

  /// Owner 2026-10-19 («подумал, что это просто тексты»): the filters are
  /// the app's chips — clearly something to tap, theme colours, the same
  /// as every other filter row.
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(
          top: AppSpacing.md,
          bottom: AppSpacing.xs,
        ),
        child: FilterChips<int>(
          value: index,
          options: [for (final (i, l) in labels.indexed) (i, l)],
          onChanged: onChanged,
        ),
      );
}

// ---------------------------------------------------------------- Files

class FilesTab extends ConsumerStatefulWidget {
  const FilesTab({required this.caseId, required this.isAttorney, super.key});

  final String caseId;
  final bool isAttorney;

  @override
  ConsumerState<FilesTab> createState() => _FilesTabState();
}

class _FilesTabState extends ConsumerState<FilesTab> {
  int _filter = 0;

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(caseFilesProvider(widget.caseId));
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: AppSkeleton(height: 120),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Text(errorText(t, e)),
      ),
      data: (all) {
        final shown = switch (_filter) {
          1 => all.where((f) => f.mime.startsWith('image/')).toList(),
          2 => all
              .where((f) => f.source == api.WorkspaceFileDtoSource.task)
              .toList(),
          3 => all
              .where((f) => f.source == api.WorkspaceFileDtoSource.update)
              .toList(),
          4 => all.where((f) => f.sample).toList(),
          _ => all,
        };
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            FilterRow(
              labels: [
                t.t('cases.files.all'),
                t.t('cases.files.photos'),
                t.t('cases.files.fromTasks'),
                t.t('cases.files.fromUpdates'),
                if (all.any((f) => f.sample)) t.t('cases.files.samples'),
              ],
              index: _filter,
              onChanged: (i) => setState(() => _filter = i),
            ),
            if (shown.isEmpty)
              Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Text(
                  t.t('cases.files.empty'),
                  style: TextStyle(color: colors.textSecondary),
                ),
              ),
            for (final f in shown) _FileRow(file: f, t: t, formats: formats),
          ],
        );
      },
    );
  }
}

String fileKindLabel(Translator t, api.WorkspaceFileDto f) =>
    f.mime.startsWith('image/')
        ? t.t('cases.files.photo')
        : t.t('cases.files.document');

class _FileRow extends StatelessWidget {
  const _FileRow({required this.file, required this.t, required this.formats});

  final api.WorkspaceFileDto file;
  final Translator t;
  final L10nFormats formats;

  String get _origin {
    final date = formats.date(DateTime.parse(file.addedAt));
    if (file.sample) {
      return '${t.t('cases.files.sample')} · $date';
    }
    return switch (file.source) {
      api.WorkspaceFileDtoSource.task => '${t.t('cases.files.fromTask', {
              'title': file.sourceTitle ?? '',
            })} · $date',
      api.WorkspaceFileDtoSource.update =>
        '${t.t('cases.files.fromUpdate')} · $date',
      _ => file.addedByRole == api.WorkspaceFileDtoAddedByRole.attorney
          ? '${t.t('cases.files.fromLawyer')} · $date'
          : date,
    };
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final isImage = file.mime.startsWith('image/');
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: Row(
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox.square(
              dimension: 48,
              child: isImage
                  ? Image(
                      image: appNetworkImage(file.previewUrl, 600),
                      fit: BoxFit.cover,
                    )
                  : ColoredBox(
                      color: colors.chip,
                      child: AppIcon(
                        AppIcons.descriptionOutlined,
                        color: colors.iconTint,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  (file.description ?? '').isEmpty
                      ? fileKindLabel(t, file)
                      : file.description!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(fontWeight: FontWeight.w600),
                ),
                const SizedBox(height: 2),
                Text(
                  _origin,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          FileOpenButton(file: file),
        ],
      ),
    );
  }
}

// ---------------------------------------------------------- read-only

/// Audit 2026-10-19: why nothing can be added here — the case is closed,
/// or (for task changes) the assistant has no «tasks» duty.
String readOnlyReasonKey(WidgetRef ref, {bool tasks = false}) => tasks &&
        ref.watch(isAssistantProvider) &&
        !ref.watch(canDoProvider(AssistantDuty.tasks))
    ? 'cases.workspace.noTasksDuty'
    : 'cases.workspace.readOnly';

/// A grey line with a lock: the workspace only shows.
class WorkspaceReadOnlyNote extends StatelessWidget {
  const WorkspaceReadOnlyNote({
    required this.text,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.lg,
      AppSpacing.sm,
      AppSpacing.lg,
      0,
    ),
    super.key,
  });

  final String text;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      key: const ValueKey('workspace-read-only'),
      padding: padding,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppIcon(
            AppIcons.lockOutlineRounded,
            size: 16,
            color: colors.textSecondary,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              text,
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

// -------------------------------------------------------------- Updates

class UpdatesTab extends ConsumerWidget {
  const UpdatesTab({required this.caseId, required this.isAttorney, super.key});

  final String caseId;
  final bool isAttorney;

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final t = ref.read(translatorProvider);
    final r = await showComposeSheet(
      context,
      mode: ComposeMode.update,
      isAttorney: isAttorney,
    );
    if (r == null || !context.mounted) return;
    try {
      await ref
          .read(caseWorkspaceActionsProvider)
          .addUpdate(caseId, r.text, r.files);
    } on Object catch (e) {
      if (context.mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(caseUpdatesProvider(caseId));
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: AppSkeleton(height: 120),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Text(errorText(t, e)),
      ),
      data: (items) => Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Audit 2026-10-19: a closed case takes no new updates.
          if (ref.watch(caseWorkspaceProvider(caseId)).value?.canWrite ?? true)
            _WriteRow(onTap: () => _add(context, ref), t: t)
          else
            WorkspaceReadOnlyNote(text: t.t(readOnlyReasonKey(ref))),
          for (final u in items) UpdateEntry(update: u, t: t, formats: formats),
          if (items.isEmpty)
            Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Text(
                t.t('cases.updates.empty'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ),
        ],
      ),
    );
  }
}

class _WriteRow extends StatelessWidget {
  const _WriteRow({required this.onTap, required this.t});

  final VoidCallback onTap;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return InkWell(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.lg,
          vertical: AppSpacing.md,
        ),
        decoration: BoxDecoration(
          border: Border(bottom: BorderSide(color: colors.border)),
        ),
        child: Row(
          children: [
            AppAvatar(size: 36, initials: t.t('cases.updates.me')),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Text(
                t.t('cases.updates.write'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ),
            AppIcon(AppIcons.attachFileRounded, color: colors.textSecondary),
          ],
        ),
      ),
    );
  }
}

String roleLine(Translator t, api.CaseUpdateDto u) {
  if (u.authorRole == api.CaseUpdateDtoAuthorRole.client) {
    return '';
  }
  final label = t.t('cases.role.attorney');
  return u.authorStates.isEmpty
      ? label
      : '$label · ${u.authorStates.join(', ')}';
}

class UpdateEntry extends StatelessWidget {
  const UpdateEntry({
    required this.update,
    required this.t,
    required this.formats,
    super.key,
  });

  final api.CaseUpdateDto update;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final u = update;
    final at = DateTime.parse(u.at);
    final initials = u.authorName.isEmpty
        ? '?'
        : u.authorName
            .split(' ')
            .where((p) => p.isNotEmpty)
            .take(2)
            .map((p) => p[0].toUpperCase())
            .join();
    final lead = switch (u.kind) {
      api.CaseUpdateDtoKind.taskDone =>
        t.t('cases.updates.taskDone', {'title': u.taskTitle ?? ''}),
      api.CaseUpdateDtoKind.taskFiles =>
        t.t('cases.updates.taskFiles', {'title': u.taskTitle ?? ''}),
      _ => null,
    };
    return Container(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.lg,
        vertical: AppSpacing.md,
      ),
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppAvatar(
            size: 36,
            initials: initials,
            imageProvider: u.authorAvatarUrl == null
                ? null
                : appNetworkImage(u.authorAvatarUrl!, 120),
          ),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        u.authorName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(fontWeight: FontWeight.w700),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text(
                      SocialFormat.ago(t, formats, at),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
                if (roleLine(t, u).isNotEmpty)
                  Text(
                    roleLine(t, u),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                if (lead != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      lead,
                      style: type.body.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                if (u.body.isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: 4),
                    child: Text(
                      u.body,
                      style: type.body.copyWith(fontSize: 14, height: 1.45),
                    ),
                  ),
                for (final f in u.files)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Row(
                      children: [
                        ClipRRect(
                          borderRadius: BorderRadius.circular(8),
                          child: SizedBox.square(
                            dimension: 44,
                            child: f.mime.startsWith('image/')
                                ? Image(
                                    image: appNetworkImage(f.previewUrl, 600),
                                    fit: BoxFit.cover,
                                  )
                                : ColoredBox(
                                    color: colors.chip,
                                    child: const AppIcon(
                                      AppIcons.descriptionOutlined,
                                    ),
                                  ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: Text(
                            (f.description ?? '').isEmpty
                                ? fileKindLabel(t, f)
                                : f.description!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall,
                          ),
                        ),
                        FileOpenButton(file: f),
                      ],
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ------------------------------------------------------------- Activity

class ActivityTab extends ConsumerWidget {
  const ActivityTab({required this.caseId, super.key});

  final String caseId;

  String _line(Translator t, api.CaseActivityDto a) {
    final who = a.actorName.isEmpty ? '' : a.actorName;
    final task = a.taskTitle ?? '';
    return switch (a.kind) {
      api.CaseActivityDtoKind.update =>
        t.t('cases.activity.update', {'name': who}),
      api.CaseActivityDtoKind.taskCreated =>
        t.t('cases.activity.taskCreated', {'name': who, 'title': task}),
      api.CaseActivityDtoKind.taskDone =>
        t.t('cases.activity.taskDone', {'name': who, 'title': task}),
      api.CaseActivityDtoKind.taskUndone =>
        t.t('cases.activity.taskUndone', {'name': who, 'title': task}),
      api.CaseActivityDtoKind.taskClosed =>
        t.t('cases.activity.taskClosed', {'name': who, 'title': task}),
      api.CaseActivityDtoKind.taskReopened =>
        t.t('cases.activity.taskReopened', {'name': who, 'title': task}),
      _ => t.t(
          'cases.activity.filesAdded',
          {'name': who, 'title': task, 'count': '${a.fileCount}'},
        ),
    };
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(caseActivityProvider(caseId));
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: AppSkeleton(height: 120),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Text(errorText(t, e)),
      ),
      data: (items) {
        final out = <Widget>[];
        String? day;
        for (final a in items) {
          final at = DateTime.parse(a.at);
          final d = formats.date(at);
          if (d != day) {
            day = d;
            out.add(
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  AppSpacing.lg,
                  AppSpacing.lg,
                  AppSpacing.xs,
                ),
                child: Text(
                  d,
                  style: type.caption.copyWith(
                    color: colors.textSecondary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
              ),
            );
          }
          out.add(
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: 6,
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    margin: const EdgeInsets.only(top: 7, right: 12),
                    width: 8,
                    height: 8,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: colors.gold,
                    ),
                  ),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          _line(t, a),
                          style: type.body.copyWith(height: 1.35),
                        ),
                        if ((a.text ?? '').isNotEmpty)
                          Text(
                            a.text!,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.bodySmall
                                .copyWith(color: colors.textSecondary),
                          ),
                        Text(
                          formats.time(at),
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          );
        }
        if (items.isEmpty) {
          out.add(
            Padding(
              padding: const EdgeInsets.all(AppSpacing.lg),
              child: Text(
                t.t('cases.activity.empty'),
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ),
          );
        }
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: out,
        );
      },
    );
  }
}
