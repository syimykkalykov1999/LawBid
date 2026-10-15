import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/workspace/compose_sheet.dart';
import 'package:lawbid/features/cases/workspace/file_actions.dart';
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/cases/workspace/workspace_view.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-13: Tasks of an accepted case. The attorney sees three
/// kinds (For client · Shared · Private), the client two (Your tasks ·
/// Lawyer's progress); one list at a time, picked by text filters.
class TasksTab extends ConsumerStatefulWidget {
  const TasksTab({required this.caseId, required this.isAttorney, super.key});

  final String caseId;
  final bool isAttorney;

  @override
  ConsumerState<TasksTab> createState() => _TasksTabState();
}

class _TasksTabState extends ConsumerState<TasksTab> {
  int _filter = 0;

  Future<void> _create() async {
    final t = ref.read(translatorProvider);
    final r = await showComposeSheet(
      context,
      mode: ComposeMode.task,
      isAttorney: widget.isAttorney,
    );
    if (r == null || !mounted) return;
    try {
      await ref.read(caseWorkspaceActionsProvider).createTask(
            widget.caseId,
            kind: r.kind!,
            title: r.title,
            description: r.text.isEmpty ? null : r.text,
            items: r.items,
            files: r.files,
            dueAt: r.dueAt,
            remindBeforeMin: r.remindBeforeMin,
          );
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(caseTasksProvider(widget.caseId));
    return value.when(
      loading: () => const Padding(
        padding: EdgeInsets.all(AppSpacing.lg),
        child: AppSkeleton(height: 120),
      ),
      error: (e, _) => Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Text(errorText(t, e)),
      ),
      data: (d) {
        final lists = widget.isAttorney
            ? [d.forClient, d.shared, d.joint, d.private]
            : [d.forClient, d.joint, d.shared];
        final labels = widget.isAttorney
            ? [
                t.t('cases.tasks.forClient'),
                t.t('cases.tasks.shared'),
                t.t('cases.tasks.joint'),
                t.t('cases.tasks.private'),
              ]
            : [
                t.t('cases.tasks.yours'),
                t.t('cases.tasks.joint'),
                t.t('cases.tasks.lawyerProgress'),
              ];
        final idx = _filter.clamp(0, lists.length - 1);
        final shown = lists[idx];
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                Expanded(
                  child: FilterRow(
                    labels: [
                      for (final (i, l) in labels.indexed)
                        '$l ${_open(lists[i])}',
                    ],
                    index: idx,
                    onChanged: (i) => setState(() => _filter = i),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.only(
                    right: AppSpacing.lg,
                    top: AppSpacing.sm,
                  ),
                  child: GestureDetector(
                    onTap: _create,
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: colors.chip,
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          const AppIcon(AppIcons.addRounded, size: 14),
                          const SizedBox(width: 4),
                          Text(
                            t.t('cases.tasks.add'),
                            style: type.bodySmall
                                .copyWith(fontWeight: FontWeight.w700),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
            ),
            if (shown.isEmpty)
              Padding(
                padding: const EdgeInsets.all(AppSpacing.lg),
                child: Text(
                  t.t('cases.tasks.empty'),
                  style: type.body.copyWith(color: colors.textSecondary),
                ),
              ),
            for (final task in shown)
              TaskRow(
                caseId: widget.caseId,
                task: task,
                isAttorney: widget.isAttorney,
                t: t,
                formats: formats,
              ),
          ],
        );
      },
    );
  }
}

int _open(List<api.CaseTaskDto> l) =>
    l.where((x) => x.status == api.CaseTaskDtoStatus.open).length;

String taskSubtitle(
  Translator t,
  L10nFormats f,
  api.CaseTaskDto k, {
  required bool isAttorney,
}) {
  final n = k.fileCount;
  final files = n > 0 ? ' · ${t.plural('cases.files.count', n)}' : '';
  if (k.closed) {
    return '${t.t('cases.tasks.closedOn', {
          'date': f.date(DateTime.parse(k.closedAt ?? k.createdAt)),
        })}$files';
  }
  if (k.status == api.CaseTaskDtoStatus.done) {
    return '${t.t('cases.tasks.doneOn', {
          'date': f.date(DateTime.parse(k.doneAt ?? k.createdAt)),
        })}$files';
  }
  final dueAt = k.dueAt == null ? null : DateTime.parse(k.dueAt!);
  final due = dueAt == null
      ? ''
      : ' · ${t.t('cases.tasks.dueOn', {'date': f.date(dueAt)})}';
  if (k.itemsTotal > 0) {
    return '${t.t('cases.tasks.progress', {
          'done': '${k.itemsDone}',
          'total': '${k.itemsTotal}',
        })}$due$files';
  }
  if (k.kind == api.CaseTaskDtoKind.forClient) {
    final key = isAttorney ? 'cases.tasks.waitingClient' : 'cases.tasks.toDo';
    return '${t.t(key)}$due$files';
  }
  return '${f.date(DateTime.parse(k.createdAt))}$due$files';
}

class TaskRow extends ConsumerWidget {
  const TaskRow({
    required this.caseId,
    required this.task,
    required this.isAttorney,
    required this.t,
    required this.formats,
    super.key,
  });

  final String caseId;
  final api.CaseTaskDto task;
  final bool isAttorney;
  final Translator t;
  final L10nFormats formats;

  bool get _canTick {
    if (task.kind == api.CaseTaskDtoKind.private) return false;
    if (task.kind == api.CaseTaskDtoKind.joint) return true;
    if (task.kind == api.CaseTaskDtoKind.shared) return isAttorney;
    // For client: the client ticks (only once every line is ticked, so a
    // task with a checklist opens its sheet instead); the attorney unticks.
    return isAttorney
        ? task.status == api.CaseTaskDtoStatus.done
        : !task.closed;
  }

  Future<void> _tick(BuildContext context, WidgetRef ref) async {
    final done = task.status != api.CaseTaskDtoStatus.done;
    if (!isAttorney && done && task.itemsTotal > 0) {
      await showTaskSheet(context, caseId: caseId, taskId: task.id);
      return;
    }
    try {
      await ref
          .read(caseWorkspaceActionsProvider)
          .setTaskDone(caseId, task.id, done: done);
    } on Object catch (e) {
      if (context.mounted) {
        showAppSnackBar(context, errorText(ref.read(translatorProvider), e));
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final done = task.status == api.CaseTaskDtoStatus.done;
    final sampleFiles = task.files.take(3).toList();
    return InkWell(
      onTap: () => showTaskSheet(context, caseId: caseId, taskId: task.id),
      child: Container(
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
            GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: _canTick ? () => _tick(context, ref) : null,
              child: Padding(
                padding: const EdgeInsetsDirectional.only(end: 12, top: 2),
                child: _Tick(done: done, dim: !_canTick),
              ),
            ),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    task.title,
                    style: type.body.copyWith(
                      fontWeight: FontWeight.w600,
                      color: done ? colors.textSecondary : colors.text,
                      decoration: done ? TextDecoration.lineThrough : null,
                    ),
                  ),
                  Text(
                    taskSubtitle(t, formats, task, isAttorney: isAttorney),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  if ((task.description ?? '').isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Text(
                        task.description!,
                        maxLines: 3,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall.copyWith(height: 1.4),
                      ),
                    ),
                  if (sampleFiles.isNotEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: 6),
                      child: Row(
                        children: [
                          for (final f in sampleFiles)
                            Container(
                              margin: const EdgeInsetsDirectional.only(end: 6),
                              width: 28,
                              height: 28,
                              decoration: BoxDecoration(
                                color: colors.chip,
                                borderRadius: BorderRadius.circular(6),
                                image: f.mime.startsWith('image/')
                                    ? DecorationImage(
                                        image: NetworkImage(f.previewUrl),
                                        fit: BoxFit.cover,
                                      )
                                    : null,
                              ),
                              child: f.mime.startsWith('image/')
                                  ? null
                                  : const AppIcon(
                                      AppIcons.descriptionOutlined,
                                      size: 16,
                                    ),
                            ),
                        ],
                      ),
                    ),
                ],
              ),
            ),
            // The arrow points the way the text goes (mirrored in RTL).
            Transform.flip(
              flipX: Directionality.of(context) == TextDirection.rtl,
              child: AppIcon(
                AppIcons.chevronRightRounded,
                size: 18,
                color: colors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Tick extends StatelessWidget {
  const _Tick({required this.done, this.dim = false});

  final bool done;
  final bool dim;
  static const size = 22.0;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: done ? colors.gold : null,
        border: Border.all(
          color: done ? colors.gold : colors.textSecondary,
          width: 1.6,
        ),
      ),
      child: done
          ? AppIcon(AppIcons.checkRounded, size: size - 8, color: colors.navy)
          : null,
    );
  }
}

// -------------------------------------------------------------- Detail

Future<void> showTaskSheet(
  BuildContext context, {
  required String caseId,
  required String taskId,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _TaskSheet(caseId: caseId, taskId: taskId),
    );

class _TaskSheet extends ConsumerStatefulWidget {
  const _TaskSheet({required this.caseId, required this.taskId});

  final String caseId;
  final String taskId;

  @override
  ConsumerState<_TaskSheet> createState() => _TaskSheetState();
}

class _TaskSheetState extends ConsumerState<_TaskSheet> {
  bool _busy = false;

  Future<void> _run(Future<void> Function() job) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await job();
    } on Object catch (e) {
      if (mounted) {
        showAppSnackBar(context, errorText(ref.read(translatorProvider), e));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _addFiles({required bool isAttorney, String? itemId}) async {
    final r = await showComposeSheet(
      context,
      mode: ComposeMode.attach,
      isAttorney: isAttorney,
    );
    if (r == null || !mounted) return;
    await _run(
      () => ref.read(caseWorkspaceActionsProvider).submit(
            widget.caseId,
            widget.taskId,
            note: r.text.isEmpty ? null : r.text,
            itemId: itemId,
            files: r.files,
          ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ws = ref.watch(caseWorkspaceProvider(widget.caseId)).value;
    final tasks = ref.watch(caseTasksProvider(widget.caseId)).value;
    final all = tasks == null
        ? const <api.CaseTaskDto>[]
        : [...tasks.forClient, ...tasks.shared, ...tasks.private];
    final task = all.where((x) => x.id == widget.taskId).firstOrNull;
    final isAttorney = tasks?.role == api.CaseTasksDtoRole.attorney;
    final actions = ref.read(caseWorkspaceActionsProvider);
    if (task == null) {
      return const SizedBox(height: 200, child: AppSkeleton(height: 120));
    }
    final done = task.status == api.CaseTaskDtoStatus.done;
    final forClient = task.kind == api.CaseTaskDtoKind.forClient;
    final canAdd = !task.closed &&
        (forClient || isAttorney) &&
        task.kind != api.CaseTaskDtoKind.private;
    Widget fileTile(api.WorkspaceFileDto f) => Padding(
          padding: const EdgeInsets.only(top: 8),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: SizedBox.square(
                  dimension: 44,
                  child: f.mime.startsWith('image/')
                      ? Image.network(f.previewUrl, fit: BoxFit.cover)
                      : ColoredBox(
                          color: colors.chip,
                          child: const AppIcon(AppIcons.descriptionOutlined),
                        ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (f.sample)
                      Text(
                        t.t('cases.files.sample'),
                        style: type.caption.copyWith(
                          color: colors.goldDark,
                          fontWeight: FontWeight.w700,
                        ),
                      )
                    else if (f.addedByRole ==
                        api.WorkspaceFileDtoAddedByRole.attorney)
                      Text(
                        t.t('cases.files.fromLawyer'),
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    Text(
                      (f.description ?? '').isEmpty
                          ? fileKindLabel(t, f)
                          : f.description!,
                      maxLines: 3,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall,
                    ),
                  ],
                ),
              ),
              FileOpenButton(file: f),
            ],
          ),
        );
    return DraggableScrollableSheet(
      expand: false,
      initialChildSize: 0.8,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      builder: (context, scroll) => Column(
        children: [
          const AppSheetHandle(),
          Expanded(
            child: ListView(
              controller: scroll,
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.lg,
                AppSpacing.sm,
                AppSpacing.lg,
                AppSpacing.lg,
              ),
              children: [
                Text(
                  switch (task.kind) {
                    api.CaseTaskDtoKind.forClient =>
                      t.t('cases.tasks.forClient'),
                    api.CaseTaskDtoKind.shared => t.t('cases.tasks.shared'),
                    _ => t.t('cases.tasks.private'),
                  },
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: 4),
                Text(
                  task.title,
                  style: type.titleMedium.copyWith(
                    fontSize: 17,
                    fontWeight: FontWeight.w700,
                    color: colors.text,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  taskSubtitle(t, formats, task, isAttorney: isAttorney),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
                if ((task.description ?? '').isNotEmpty)
                  Padding(
                    padding: const EdgeInsets.only(top: AppSpacing.md),
                    child: Text(
                      task.description!,
                      style: type.body.copyWith(fontSize: 14, height: 1.5),
                    ),
                  ),
                if (task.files.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.md),
                  for (final f in task.files) fileTile(f),
                ],
                if (task.items.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    t.t('cases.tasks.progress', {
                      'done': '${task.itemsDone}',
                      'total': '${task.itemsTotal}',
                    }),
                    style: type.bodySmall.copyWith(
                      fontWeight: FontWeight.w700,
                      color: colors.textSecondary,
                    ),
                  ),
                  for (final item in task.items)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              GestureDetector(
                                behavior: HitTestBehavior.opaque,
                                onTap: forClient &&
                                        !task.closed &&
                                        (!isAttorney || item.done)
                                    ? () => _run(
                                          () => actions.setItemDone(
                                            widget.caseId,
                                            task.id,
                                            item.id,
                                            done: !item.done,
                                          ),
                                        )
                                    : null,
                                child: Padding(
                                  padding:
                                      const EdgeInsetsDirectional.only(end: 12),
                                  child: _Tick(done: item.done),
                                ),
                              ),
                              Expanded(
                                child: Text(
                                  item.title,
                                  style: type.body.copyWith(
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                              ),
                            ],
                          ),
                          for (final f in item.files)
                            Padding(
                              padding:
                                  const EdgeInsetsDirectional.only(start: 34),
                              child: fileTile(f),
                            ),
                          if (!task.closed && !isAttorney)
                            Padding(
                              padding: const EdgeInsetsDirectional.only(
                                start: 34,
                                top: 6,
                              ),
                              child: GestureDetector(
                                onTap: () => _addFiles(
                                  isAttorney: isAttorney,
                                  itemId: item.id,
                                ),
                                child: Text(
                                  '+ ${t.t('cases.tasks.addFile')}',
                                  style: type.bodySmall.copyWith(
                                    color: colors.goldDark,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                              ),
                            ),
                        ],
                      ),
                    ),
                ],
              ],
            ),
          ),
          Container(
            decoration: BoxDecoration(
              border: Border(top: BorderSide(color: colors.border)),
            ),
            padding: EdgeInsets.fromLTRB(
              AppSpacing.lg,
              AppSpacing.md,
              AppSpacing.lg,
              MediaQuery.paddingOf(context).bottom + AppSpacing.md,
            ),
            child: Row(
              children: [
                if (canAdd && task.items.isEmpty)
                  Expanded(
                    child: AppButton(
                      label: t.t(
                        done && !isAttorney
                            ? 'cases.tasks.addMore'
                            : 'cases.tasks.addFiles',
                      ),
                      icon: AppIcons.attachFileRounded,
                      variant: AppButtonVariant.secondary,
                      onPressed: _busy
                          ? null
                          : () => _addFiles(isAttorney: isAttorney),
                    ),
                  ),
                if (canAdd && task.items.isEmpty) const SizedBox(width: 10),
                if (!isAttorney && forClient && !done)
                  Expanded(
                    child: AppButton(
                      label: t.t('cases.tasks.done'),
                      isLoading: _busy,
                      onPressed: _busy
                          ? null
                          : () => _run(
                                () => actions.setTaskDone(
                                  widget.caseId,
                                  task.id,
                                  done: true,
                                ),
                              ),
                    ),
                  ),
                if (isAttorney && task.kind == api.CaseTaskDtoKind.shared)
                  Expanded(
                    child: AppButton(
                      label: t.t(
                        done ? 'cases.tasks.undo' : 'cases.tasks.markDone',
                      ),
                      isLoading: _busy,
                      onPressed: _busy
                          ? null
                          : () => _run(
                                () => actions.setTaskDone(
                                  widget.caseId,
                                  task.id,
                                  done: !done,
                                ),
                              ),
                    ),
                  ),
                if (isAttorney && forClient) ...[
                  if (done)
                    Padding(
                      padding: const EdgeInsetsDirectional.only(end: 10),
                      child: AppButton(
                        label: t.t('cases.tasks.undo'),
                        variant: AppButtonVariant.secondary,
                        onPressed: _busy
                            ? null
                            : () => _run(
                                  () => actions.setTaskDone(
                                    widget.caseId,
                                    task.id,
                                    done: false,
                                  ),
                                ),
                      ),
                    ),
                  Expanded(
                    child: AppButton(
                      label: t.t(
                        task.closed
                            ? 'cases.tasks.reopen'
                            : 'cases.tasks.close',
                      ),
                      isLoading: _busy,
                      onPressed: _busy
                          ? null
                          : () => _run(
                                () => actions.setTaskClosed(
                                  widget.caseId,
                                  task.id,
                                  closed: !task.closed,
                                ),
                              ),
                    ),
                  ),
                ],
                if (ws == null) const SizedBox.shrink(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
