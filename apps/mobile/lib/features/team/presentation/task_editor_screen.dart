import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_kind_form.dart';
import 'package:lawbid/features/team/presentation/task_pickers.dart';
import 'package:lawbid/features/team/presentation/task_sheet.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';

/// OQ-048 (owner 2026-09-30): a new task — set by an assistant for the
/// attorney or by the attorney for themself: what (call, meeting, court,
/// deadline, documents, print, visit, other), when, where, who, which
/// case, details and documents.
class TaskEditorScreen extends ConsumerStatefulWidget {
  const TaskEditorScreen({
    this.initialKind,
    this.existing,
    this.initialCase,
    this.initialChat,
    this.initialPeople = const [],
    super.key,
  });

  final TaskKind? initialKind;

  /// Owner 2026-10-05: "+ Task" from a case / a chat — the task comes
  /// already linked (and with the chat's person on it).
  final ({String id, String title})? initialCase;
  final ({String id, String title})? initialChat;
  final List<TaskPerson> initialPeople;

  /// Owner 2026-10-01: edit this task (null = a new one).
  final TaskItem? existing;

  @override
  ConsumerState<TaskEditorScreen> createState() => _TaskEditorScreenState();
}

typedef _Attachment = ({String name, String? fileId, bool failed});

class _TaskEditorScreenState extends ConsumerState<TaskEditorScreen> {
  late TaskKind _kind =
      widget.existing?.kind ?? widget.initialKind ?? TaskKind.call;

  /// Owner 2026-10-01: a new task first shows only "What to do"; the
  /// fields of the chosen kind open after a tap (editing: open at once).
  late bool _picked = widget.existing != null || widget.initialKind != null;
  late final _title = TextEditingController(text: widget.existing?.title);
  late final _notes = TextEditingController(text: widget.existing?.notes);
  late DateTime? _due = widget.existing?.dueAt?.toLocal();

  /// Owner 2026-10-05: every address and every person of the task.
  late final List<TaskPlace> _places = [...?widget.existing?.places];
  late final List<TaskPerson> _people = [
    ...?widget.existing?.people,
    if (widget.existing == null) ...widget.initialPeople,
  ];
  late TaskPriority _priority =
      widget.existing?.priority ?? TaskPriority.normal;
  late TaskRepeat _repeat = widget.existing?.repeat ?? TaskRepeat.none;
  late DateTime? _repeatUntil = widget.existing?.repeatUntil?.toLocal();

  /// Minutes before the time; a new task reminds at the time itself.
  late int? _remind =
      widget.existing == null ? 0 : widget.existing!.remindBeforeMin;
  late ({String id, String name})? _assignee =
      widget.existing?.assigneeMembershipId == null
          ? null
          : (
              id: widget.existing!.assigneeMembershipId!,
              name: widget.existing!.assigneeName ?? '',
            );
  late String? _chatId =
      widget.existing?.conversationId ?? widget.initialChat?.id;
  late final String? _chatTitle = widget.initialChat?.title;

  /// The linked case: the attorney's work in progress, a client's own.
  late ({String id, String title})? _case = widget.existing?.caseId == null
      ? widget.initialCase
      : (
          id: widget.existing!.caseId!,
          title: widget.existing!.caseTitle ?? '',
        );
  late final List<_Attachment> _files = [
    for (final (i, f) in (widget.existing?.files ?? const <TaskFile>[]).indexed)
      (name: '${i + 1}. ${f.mime ?? 'file'}', fileId: f.fileId, failed: false),
  ];

  /// Owner 2026-10-01: the checklist — as many steps as needed.
  final List<TaskStepDraft> _steps = [];
  int _uploading = 0;
  bool _saving = false;
  bool _tried = false;
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    _title.dispose();
    _notes.dispose();
    super.dispose();
  }

  String? _clean(TextEditingController c) =>
      c.text.trim().isEmpty ? null : c.text.trim();

  /// Owner 2026-10-07 (bugs 14, 17): files on one task, their MB and
  /// formats — the admin's «Задачи» limits (the server checks them too).
  PlaceUploadLimits get _limits =>
      ref.read(uploadLimitsProvider)[UploadPlace.task];
  int get _maxFiles => _limits.maxFiles;

  bool get _filesFull => _files.length >= _maxFiles;

  String _filesLimitText(Translator t) =>
      t.t('tasks.files.limit', {'max': '$_maxFiles'});

  Future<void> _attach() async {
    final t = ref.read(translatorProvider);
    if (_filesFull) {
      showAppSnackBar(context, _filesLimitText(t));
      return;
    }
    var picked = await pickChatFiles(context, t, limits: _limits);
    if (picked.isEmpty || !mounted) return;
    if (_files.length + picked.length > _maxFiles) {
      picked = picked.take(_maxFiles - _files.length).toList();
      showAppSnackBar(context, _filesLimitText(t));
    }
    final repo = ref.read(teamRepositoryProvider);
    for (final f in picked) {
      final index = _files.length;
      setState(() {
        _files.add((name: f.name, fileId: null, failed: false));
        _uploading++;
      });
      try {
        final id = await repo.uploadTaskFile(f.bytes, f.mime);
        if (mounted) {
          setState(
            () => _files[index] = (name: f.name, fileId: id, failed: false),
          );
        }
      } on Object {
        if (mounted) {
          setState(
            () => _files[index] = (name: f.name, fileId: null, failed: true),
          );
        }
      } finally {
        if (mounted) setState(() => _uploading--);
      }
    }
  }

  Future<void> _pickCase() async {
    final t = ref.read(translatorProvider);
    final attorney = ref.read(actsAsAttorneyProvider);
    final picked = await showAppBottomSheet<({String id, String title})>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Consumer(
        builder: (ctx, ref, _) {
          // Owner 2026-10-01: a client's planner links their own cases.
          final work =
              attorney ? ref.watch(myWorkProvider(WorkFilter.active)) : null;
          final mine = attorney
              ? null
              : ref.watch(myCasesProvider(MyCasesFilter.active));
          final loading = (work ?? mine)!.isLoading;
          final items = <({String id, String title})>[
            for (final w in work?.value?.items ?? const <WorkItem>[])
              (id: w.caseId, title: w.title),
            for (final c in mine?.value?.items ?? const <CaseSummary>[])
              (id: c.id, title: c.title),
          ];
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(ctx).height * 0.6,
              ),
              child: loading && items.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(AppSpacing.xl),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  : items.isEmpty
                      ? AppEmptyState(
                          icon: AppIcons.workOutlineRounded,
                          message: t.t(
                            attorney ? 'mine.work.empty' : 'tasks.casesEmpty',
                          ),
                        )
                      : ListView(
                          shrinkWrap: true,
                          children: [
                            if (_case != null)
                              AppListRow(
                                key: const ValueKey('task-case-clear'),
                                icon: AppIcons.linkOffRounded,
                                label: t.t('tasks.field.caseNone'),
                                onTap: () =>
                                    Navigator.of(ctx).pop((id: '', title: '')),
                              ),
                            for (final w in items)
                              AppListRow(
                                icon: AppIcons.workOutlineRounded,
                                label: w.title,
                                selected: _case?.id == w.id,
                                onTap: () => Navigator.of(ctx).pop(w),
                              ),
                          ],
                        ),
            ),
          );
        },
      ),
    );
    if (picked != null) {
      setState(() => _case = picked.id.isEmpty ? null : picked);
    }
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    setState(() => _tried = true);
    // The required field is at the top: bring it into view, or a long form
    // scrolled down looks like the button does nothing.
    if (_title.text.trim().isEmpty) {
      if (_scroll.hasClients) {
        unawaited(
          _scroll.animateTo(
            0,
            duration: const Duration(milliseconds: 250),
            curve: Curves.easeOut,
          ),
        );
      }
      return;
    }
    if (_uploading > 0) return;
    setState(() => _saving = true);
    try {
      final timed = _due != null;
      final draft = TaskDraft(
        kind: _kind,
        title: _title.text.trim(),
        notes: _clean(_notes),
        dueAt: _due,
        caseId: _case?.id,
        fileIds: [
          for (final f in _files)
            if (f.fileId != null) f.fileId!,
        ],
        steps: List.of(_steps),
        places: List.of(_places),
        people: List.of(_people),
        priority: _priority,
        // A repeat and a reminder need a time.
        repeat: timed ? _repeat : TaskRepeat.none,
        repeatUntil: timed && _repeat != TaskRepeat.none ? _repeatUntil : null,
        remindBeforeMin: timed ? _remind : null,
        assigneeMembershipId: _assignee?.id,
        conversationId: _chatId,
        keepForever: widget.existing?.keepForever ?? false,
      );
      final existing = widget.existing;
      if (existing == null) {
        await ref.read(teamRepositoryProvider).createTask(draft);
      } else {
        await ref.read(teamRepositoryProvider).updateTask(existing.id, draft);
      }
      invalidateAllTasks(ref);
      ref.invalidate(taskPlacesProvider);
      if (!mounted) return;
      // ignore: unawaited_futures
      HapticFeedback.mediumImpact();
      showAppSnackBar(context, t.t('tasks.saved'));
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  Future<void> _addPlace([int? index]) async {
    FocusScope.of(context).unfocus();
    final p = await showPlaceEditor(
      context,
      initial: index == null ? null : _places[index],
      taken: {for (final x in _places) x.address.toLowerCase()},
    );
    if (p == null || !mounted) return;
    setState(() => index == null ? _places.add(p) : _places[index] = p);
  }

  Future<void> _addPeople() async {
    FocusScope.of(context).unfocus();
    final picked = await showPeoplePicker(
      context,
      takenUserIds: {
        for (final p in _people)
          if (p.userId != null) p.userId!,
      },
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    setState(() => _people.addAll(picked));
  }

  Future<void> _editPerson(int index) async {
    final p = await showContactEditor(context, initial: _people[index]);
    if (p != null && mounted) setState(() => _people[index] = p);
  }

  Future<void> _pickRemind(Translator t) async {
    final i = await showChoiceSheet(
      context,
      title: t.t('tasks.remind.title'),
      labels: [for (final m in taskRemindChoices) taskRemindLabel(t, m)],
      selected: taskRemindChoices.indexOf(_remind),
      keyPrefix: 'remind',
    );
    if (i != null && mounted) setState(() => _remind = taskRemindChoices[i]);
  }

  Future<void> _pickRepeat(Translator t) async {
    final i = await showChoiceSheet(
      context,
      title: t.t('tasks.repeat.title'),
      labels: [for (final r in TaskRepeat.values) taskRepeatLabel(t, r)],
      selected: _repeat.index,
      keyPrefix: 'repeat',
    );
    if (i != null && mounted) {
      setState(() => _repeat = TaskRepeat.values[i]);
    }
  }

  /// Owner 2026-10-05: who does it — the attorney or one of the team.
  Future<void> _pickAssignee(Translator t) async {
    final assistant = ref.read(isAssistantProvider);
    final team = [
      for (final s in await ref.read(taskPeopleProvider('').future))
        if (s.source == TaskPersonSource.assistant && s.membershipId != null)
          (id: s.membershipId!, name: s.name),
    ];
    if (!mounted) return;
    final i = await showChoiceSheet(
      context,
      title: t.t('tasks.assignee.title'),
      labels: [
        t.t(assistant ? 'tasks.assignee.attorney' : 'tasks.assignee.me'),
        for (final a in team) a.name,
      ],
      selected: _assignee == null
          ? 0
          : 1 + team.indexWhere((a) => a.id == _assignee!.id),
      keyPrefix: 'assignee',
    );
    if (i == null || !mounted) return;
    setState(() => _assignee = i == 0 ? null : team[i - 1]);
  }

  /// A section title with its "+ Add" on the right; the button never moves
  /// or wraps, a long label shrinks into an ellipsis.
  Widget _sectionHead(
    String title,
    String add,
    TextStyle label,
    Key key,
    VoidCallback onAdd,
  ) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Row(
      children: [
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: label,
          ),
        ),
        ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 190),
          child: TextButton.icon(
            key: key,
            onPressed: onAdd,
            icon: AppIcon(AppIcons.addRounded, color: colors.goldDark),
            label: Text(
              add,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(color: colors.goldDark),
            ),
          ),
        ),
      ],
    );
  }

  /// The kind's own fields: what, when, where, who, case, details.
  List<Widget> _fields(Translator t, L10nFormats formats, TextStyle label) {
    final f = TaskKindForm.of(_kind);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final canAssign = ref.watch(canDoProvider(AssistantDuty.tasks)) &&
        ref.watch(actsAsAttorneyProvider);
    String k(String key) => t.t('tasks.f.$key');
    final places = [
      _sectionHead(
        k(f.where ?? 'place'),
        t.t('tasks.place.add'),
        label,
        const ValueKey('task-place-add'),
        _addPlace,
      ),
      for (final (i, p) in _places.indexed)
        _EditorItem(
          key: ValueKey('task-place-$i'),
          leading: AppIcon(AppIcons.placeOutlined, color: colors.goldDark),
          title: p.label ?? p.address,
          subtitle: p.label == null ? null : p.address,
          removeLabel: t.t('common.delete'),
          onTap: () => _addPlace(i),
          onRemove: () => setState(() => _places.removeAt(i)),
        ),
      const SizedBox(height: AppSpacing.sm),
    ];
    final people = [
      _sectionHead(
        k(f.contact ?? 'people'),
        t.t('tasks.people.addShort'),
        label,
        const ValueKey('task-person-add'),
        _addPeople,
      ),
      for (final (i, p) in _people.indexed)
        _EditorItem(
          key: ValueKey('task-person-$i'),
          leading: TaskPersonAvatar(name: p.name, avatarUrl: p.avatarUrl),
          title: p.name,
          subtitle: [
            p.role,
            if (p.inApp && p.role == null)
              t.t('tasks.people.inApp.${p.userRole ?? 'attorney'}'),
            p.phone,
            p.email,
          ].whereType<String>().where((x) => x.isNotEmpty).join(' · '),
          removeLabel: t.t('common.delete'),
          onTap: () => _editPerson(i),
          onRemove: () => setState(() => _people.removeAt(i)),
        ),
      const SizedBox(height: AppSpacing.sm),
    ];
    return [
      AppTextField(
        key: const ValueKey('task-title'),
        controller: _title,
        label: k(f.title),
        hintText: k('${f.title}Hint'),
        maxLength: 200,
        textCapitalization: TextCapitalization.sentences,
        errorText: _tried && _title.text.trim().isEmpty
            ? t.t('post.create.required')
            : null,
        onChanged: (_) => _tried ? setState(() {}) : null,
      ),
      const SizedBox(height: AppSpacing.md),
      Text(k(f.when), style: label),
      const SizedBox(height: AppSpacing.sm),
      AppCard(
        padding: EdgeInsets.zero,
        child: Column(
          children: [
            AppListRow(
              key: const ValueKey('task-when'),
              icon: AppIcons.eventOutlined,
              label: _due == null
                  ? t.t('tasks.field.date')
                  : formats.dateTime(_due!),
              trailingText: _due == null ? null : '✕',
              onTap: () async {
                if (_due != null) {
                  setState(() => _due = null);
                  return;
                }
                final picked = await pickDateTime(context);
                if (picked != null) setState(() => _due = picked);
              },
            ),
            // Owner 2026-10-05: a reminder and a repeat need a time.
            if (_due != null) ...[
              AppListRow(
                key: const ValueKey('task-remind'),
                icon: _remind == null
                    ? AppIcons.notificationsOffOutlined
                    : AppIcons.notificationsActiveOutlined,
                label: taskRemindLabel(t, _remind),
                onTap: () => _pickRemind(t),
              ),
              AppListRow(
                key: const ValueKey('task-repeat'),
                icon: AppIcons.eventRepeatRounded,
                label: taskRepeatLabel(t, _repeat),
                onTap: () => _pickRepeat(t),
              ),
              if (_repeat != TaskRepeat.none)
                AppListRow(
                  key: const ValueKey('task-repeat-until'),
                  icon: AppIcons.eventAvailableOutlined,
                  label: _repeatUntil == null
                      ? t.t('tasks.repeat.forever')
                      : t.t('tasks.repeat.until', {
                          'date': formats.dateLong(_repeatUntil!),
                        }),
                  trailingText: _repeatUntil == null ? null : '✕',
                  onTap: () async {
                    if (_repeatUntil != null) {
                      setState(() => _repeatUntil = null);
                      return;
                    }
                    final now = DateTime.now();
                    final d = await showDatePicker(
                      context: context,
                      initialDate: _due!.isAfter(now) ? _due! : now,
                      firstDate: now,
                      lastDate: DateTime(now.year + 10),
                    );
                    if (d != null && mounted) {
                      setState(
                        () => _repeatUntil =
                            DateTime(d.year, d.month, d.day, 23, 59),
                      );
                    }
                  },
                ),
            ],
          ],
        ),
      ),
      const SizedBox(height: AppSpacing.md),
      // Owner 2026-10-05: how urgent — one row, the chips shrink their
      // words instead of wrapping.
      Text(t.t('tasks.priority.title'), style: label),
      const SizedBox(height: AppSpacing.sm),
      Row(
        children: [
          for (final (i, p) in TaskPriority.values.indexed) ...[
            if (i > 0) const SizedBox(width: AppSpacing.xs),
            Expanded(
              child: AppChip(
                key: ValueKey('task-priority-${p.wire}'),
                label: taskPriorityLabel(t, p),
                fitLabel: true,
                selected: _priority == p,
                onTap: () => setState(() => _priority = p),
              ),
            ),
          ],
        ],
      ),
      const SizedBox(height: AppSpacing.lg),
      // The kind decides what comes first: a visit — where, a call — who.
      if (f.where != null || f.contact == null) ...[
        ...places,
        ...people,
      ] else ...[
        ...people,
        ...places,
      ],
      if (f.caseLink || canAssign || _chatId != null) ...[
        const SizedBox(height: AppSpacing.sm),
        AppCard(
          padding: EdgeInsets.zero,
          child: Column(
            children: [
              if (f.caseLink)
                AppListRow(
                  key: const ValueKey('task-case'),
                  icon: AppIcons.workOutlineRounded,
                  label: _case?.title ?? t.t('tasks.field.casePick'),
                  subtitle: _case == null ? null : t.t('tasks.field.case'),
                  onTap: _pickCase,
                ),
              if (_chatId != null)
                AppListRow(
                  key: const ValueKey('task-chat'),
                  icon: AppIcons.chatBubbleOutlineRounded,
                  label: _chatTitle ?? t.t('tasks.chat.linked'),
                  subtitle: t.t('tasks.chat.title'),
                  trailingText: '✕',
                  onTap: () => setState(() => _chatId = null),
                ),
              if (canAssign)
                AppListRow(
                  key: const ValueKey('task-assignee'),
                  icon: AppIcons.personAddAlt1Rounded,
                  label: _assignee?.name ??
                      t.t(
                        ref.watch(isAssistantProvider)
                            ? 'tasks.assignee.attorney'
                            : 'tasks.assignee.me',
                      ),
                  subtitle: t.t('tasks.assignee.title'),
                  onTap: () => _pickAssignee(t),
                ),
            ],
          ),
        ),
      ],
      const SizedBox(height: AppSpacing.lg),
      AppTextField(
        key: const ValueKey('task-notes'),
        controller: _notes,
        label: k(f.notes),
        maxLines: 4,
        maxLength: 2000,
        textCapitalization: TextCapitalization.sentences,
      ),
      if (_places.isEmpty && _people.isEmpty)
        Text(
          t.t('tasks.editor.tip'),
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
      const SizedBox(height: AppSpacing.md),
    ];
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final assistant = ref.watch(isAssistantProvider);
    final label = typography.body.copyWith(
      color: colors.text,
      fontWeight: FontWeight.w600,
    );
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.close'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: Text(
          widget.existing != null
              ? t.t('tasks.edit')
              : t.t(assistant ? 'tasks.forAttorney' : 'tasks.forMe'),
        ),
      ),
      body: ListView(
        controller: _scroll,
        // The save button ends the list: keep it clear of the iPhone home
        // indicator (Android reserves its bar in SystemNavBand).
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.xxl + MediaQuery.paddingOf(context).bottom,
        ),
        children: [
          Text(t.t('tasks.field.kind'), style: label),
          const SizedBox(height: AppSpacing.sm),
          if (!_picked) ...[
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: AppSpacing.sm,
              crossAxisSpacing: AppSpacing.sm,
              childAspectRatio: 0.82,
              children: [
                for (final k in TaskKind.values)
                  _KindTile(
                    key: ValueKey('task-kind-${k.wire}'),
                    icon: taskKindIcon(k),
                    label: taskKindLabel(t, k),
                    selected: _kind == k,
                    onTap: () {
                      HapticFeedback.selectionClick();
                      setState(() {
                        _kind = k;
                        _picked = true;
                      });
                    },
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              t.t('tasks.pickKind'),
              textAlign: TextAlign.center,
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ] else
            _PickedKind(
              icon: taskKindIcon(_kind),
              label: taskKindLabel(t, _kind),
              changeLabel: t.t('tasks.kindChange'),
              onChange: () => setState(() => _picked = false),
            ),
          if (_picked) ...[
            const SizedBox(height: AppSpacing.lg),
            // Owner 2026-10-01: the fields below follow the kind of task.
            ..._fields(t, formats, label),
            // Owner 2026-10-01: several calls / meetings / addresses go into
            // this one task as steps, each with its own time. (Editing: steps
            // are managed on the task itself.)
            if (widget.existing == null) ...[
              Row(
                children: [
                  Expanded(child: Text(t.t('tasks.steps.title'), style: label)),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 180),
                    child: TextButton.icon(
                      key: const ValueKey('task-editor-step-add'),
                      onPressed: () async {
                        FocusScope.of(context).unfocus();
                        final d =
                            await showStepEditor(context, taskKind: _kind);
                        if (d != null && mounted) {
                          setState(() => _steps.add(d));
                        }
                      },
                      icon:
                          AppIcon(AppIcons.addRounded, color: colors.goldDark),
                      label: Text(
                        t.t('tasks.steps.add'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: TextStyle(color: colors.goldDark),
                      ),
                    ),
                  ),
                ],
              ),
              if (_steps.isEmpty)
                Text(
                  t.t('tasks.steps.editorHint'),
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                )
              else
                AppCard(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.xs,
                  ),
                  child: ReorderableListView(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    buildDefaultDragHandles: false,
                    // ignore: deprecated_member_use
                    onReorder: (from, to) => setState(() {
                      final s = _steps.removeAt(from);
                      _steps.insert(to > from ? to - 1 : to, s);
                    }),
                    children: [
                      for (final (i, d) in _steps.indexed)
                        Row(
                          key: ValueKey('draft-step-$i-${d.title}'),
                          children: [
                            ReorderableDragStartListener(
                              index: i,
                              child: Padding(
                                padding: const EdgeInsets.all(AppSpacing.xs),
                                child: AppIcon(
                                  AppIcons.dragIndicatorRounded,
                                  size: 20,
                                  color: colors.textSecondary,
                                ),
                              ),
                            ),
                            Expanded(
                              child: TaskStepTile(
                                step: TaskStep(
                                  id: 'draft-$i',
                                  title: d.title,
                                  kind: d.kind,
                                  dueAt: d.dueAt,
                                  location: d.location,
                                  contactName: d.contactName,
                                  contactPhone: d.contactPhone,
                                  contactEmail: d.contactEmail,
                                ),
                                t: t,
                                formats: formats,
                                now: DateTime.now(),
                              ),
                            ),
                            AppIconButton(
                              icon: const AppIcon(AppIcons.closeRounded),
                              semanticLabel: t.t('common.delete'),
                              onPressed: () =>
                                  setState(() => _steps.removeAt(i)),
                            ),
                          ],
                        ),
                    ],
                  ),
                ),
              const SizedBox(height: AppSpacing.lg),
            ],
            if (TaskKindForm.of(_kind).files) ...[
              Row(
                children: [
                  Expanded(
                    child: Text(t.t('tasks.field.files'), style: label),
                  ),
                  if (_maxFiles > 0)
                    Text(
                      '${_files.length}/$_maxFiles',
                      key: const ValueKey('task-files-count'),
                      style: typography.bodySmall.copyWith(
                        color: _filesFull
                            ? colors.dangerText
                            : colors.textSecondary,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              for (final (i, f) in _files.indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                  child: Row(
                    children: [
                      AppIcon(
                        f.failed
                            ? AppIcons.errorOutlineRounded
                            : f.fileId == null
                                ? AppIcons.cloudUploadOutlined
                                : AppIcons.checkCircleOutlineRounded,
                        size: AppSizes.iconSm,
                        color: f.failed
                            ? colors.dangerText
                            : f.fileId == null
                                ? colors.textSecondary
                                : colors.success,
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          f.name,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style:
                              typography.bodySmall.copyWith(color: colors.text),
                        ),
                      ),
                      if (f.fileId == null && !f.failed)
                        const SizedBox.square(
                          dimension: 16,
                          child: CircularProgressIndicator(strokeWidth: 2),
                        )
                      else
                        AppIconButton(
                          icon: const AppIcon(AppIcons.closeRounded),
                          semanticLabel: t.t('common.delete'),
                          onPressed: () => setState(() => _files.removeAt(i)),
                        ),
                    ],
                  ),
                ),
              Align(
                alignment: AlignmentDirectional.centerStart,
                // Full: greyed, a tap says why (bug 7 rule).
                child: TextButton.icon(
                  key: const ValueKey('task-attach'),
                  onPressed: _attach,
                  style: _filesFull
                      ? TextButton.styleFrom(
                          foregroundColor:
                              colors.textSecondary.withValues(alpha: 0.6),
                        )
                      : null,
                  icon: const AppIcon(AppIcons.attachFileRounded),
                  label: Text(
                    _filesFull ? _filesLimitText(t) : t.t('tasks.field.attach'),
                  ),
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.xl),
            AppButton(
              key: const ValueKey('task-save'),
              label: t.t('tasks.save'),
              icon: AppIcons.checkRounded,
              isLoading: _saving || _uploading > 0,
              onPressed: _save,
            ),
          ],
        ],
      ),
    );
  }
}

/// One address / person in the editor: tap edits, ✕ removes.
class _EditorItem extends StatelessWidget {
  const _EditorItem({
    required this.leading,
    required this.title,
    required this.removeLabel,
    required this.onTap,
    required this.onRemove,
    this.subtitle,
    super.key,
  });

  final Widget leading;
  final String title;
  final String? subtitle;
  final String removeLabel;
  final VoidCallback onTap;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.xs),
      child: Material(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.field),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(AppRadii.field),
          child: Container(
            padding: const EdgeInsetsDirectional.only(
              start: AppSpacing.md,
              top: AppSpacing.xs,
              bottom: AppSpacing.xs,
            ),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(color: colors.border),
            ),
            child: Row(
              children: [
                leading,
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (subtitle?.isNotEmpty ?? false)
                        Text(
                          subtitle!,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: typography.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                    ],
                  ),
                ),
                AppIconButton(
                  icon: const AppIcon(AppIcons.closeRounded),
                  semanticLabel: removeLabel,
                  onPressed: onRemove,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// The chosen kind, collapsed to one line with "Change".
class _PickedKind extends StatelessWidget {
  const _PickedKind({
    required this.icon,
    required this.label,
    required this.changeLabel,
    required this.onChange,
  });

  final IconData icon;
  final String label;
  final String changeLabel;
  final VoidCallback onChange;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      key: const ValueKey('task-kind-picked'),
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.md,
        vertical: AppSpacing.sm,
      ),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.gold),
      ),
      child: Row(
        children: [
          AppIcon(icon, color: colors.gold, size: 26),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              label,
              style: typography.body.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 140),
            child: TextButton(
              key: const ValueKey('task-kind-change'),
              onPressed: onChange,
              child: Text(
                changeLabel,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _KindTile extends StatelessWidget {
  const _KindTile({
    required this.icon,
    required this.label,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      excludeSemantics: true,
      child: AppPressable(
        onTap: onTap,
        child: AnimatedContainer(
          duration: dur,
          decoration: BoxDecoration(
            color: selected ? colors.goldTint : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(
              color: selected ? colors.gold : colors.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          padding: const EdgeInsets.all(AppSpacing.xs),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              AppIcon(
                icon,
                color: selected ? colors.gold : colors.textSecondary,
              ),
              const SizedBox(height: 6),
              // Flexible: the grid cell has a fixed height.
              Flexible(
                child: Text(
                  label,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  textAlign: TextAlign.center,
                  style: typography.caption.copyWith(
                    color: selected ? colors.text : colors.textSecondary,
                    fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Audit 2026-10-01: "312 555 0123" / "(312) 555-0123" / "1 312…" →
/// +13125550123 (a US number); null when it isn't a phone number.
String? normalizeTaskPhone(String input) {
  final raw = input.trim();
  if (raw.isEmpty) return '';
  final digits = raw.replaceAll(RegExp('[^0-9]'), '');
  final String e164;
  if (raw.startsWith('+')) {
    e164 = '+$digits';
  } else if (digits.length == 10) {
    e164 = '+1$digits';
  } else if (digits.length == 11 && digits.startsWith('1')) {
    e164 = '+$digits';
  } else {
    return null;
  }
  return RegExp(r'^\+[1-9][0-9]{7,14}$').hasMatch(e164) ? e164 : null;
}
