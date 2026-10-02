import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
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
import 'package:lawbid/features/team/presentation/task_sheet.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';

/// OQ-048 (owner 2026-09-30): a new task — set by an assistant for the
/// attorney or by the attorney for themself: what (call, meeting, court,
/// deadline, documents, print, visit, other), when, where, who, which
/// case, details and documents.
class TaskEditorScreen extends ConsumerStatefulWidget {
  const TaskEditorScreen({this.initialKind, this.existing, super.key});

  final TaskKind? initialKind;

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
  late final _location = TextEditingController(text: widget.existing?.location);
  late final _contactName =
      TextEditingController(text: widget.existing?.contactName);
  late final _contactPhone =
      TextEditingController(text: widget.existing?.contactPhone);
  late final _contactEmail =
      TextEditingController(text: widget.existing?.contactEmail);
  late final _notes = TextEditingController(text: widget.existing?.notes);
  late DateTime? _due = widget.existing?.dueAt?.toLocal();

  /// The linked case: the attorney's work in progress, a client's own.
  late ({String id, String title})? _case = widget.existing?.caseId == null
      ? null
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
    _location.dispose();
    _contactName.dispose();
    _contactPhone.dispose();
    _contactEmail.dispose();
    _notes.dispose();
    super.dispose();
  }

  String? _clean(TextEditingController c) =>
      c.text.trim().isEmpty ? null : c.text.trim();

  Future<void> _attach() async {
    final t = ref.read(translatorProvider);
    final picked = await pickChatFiles(context, t);
    if (picked.isEmpty || !mounted) return;
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
    final form = TaskKindForm.of(_kind);
    if (form.email &&
        _contactEmail.text.trim().isNotEmpty &&
        !_emailRe.hasMatch(_contactEmail.text.trim())) {
      return;
    }
    final phone = form.phone ? normalizeTaskPhone(_contactPhone.text) : '';
    if (phone == null) return;
    setState(() => _saving = true);
    try {
      final draft = TaskDraft(
        kind: _kind,
        title: _title.text.trim(),
        notes: _clean(_notes),
        dueAt: _due,
        location: form.where != null ? _clean(_location) : null,
        caseId: _case?.id,
        contactName: form.contact != null ? _clean(_contactName) : null,
        contactPhone: phone.isEmpty ? null : phone,
        contactEmail: form.email ? _clean(_contactEmail) : null,
        fileIds: [
          for (final f in _files)
            if (f.fileId != null) f.fileId!,
        ],
        steps: List.of(_steps),
      );
      final existing = widget.existing;
      if (existing == null) {
        await ref.read(teamRepositoryProvider).createTask(draft);
      } else {
        await ref.read(teamRepositoryProvider).updateTask(existing.id, draft);
      }
      ref.invalidate(tasksProvider((done: false, mine: false)));
      // ignore: cascade_invocations
      ref.invalidate(tasksProvider((done: false, mine: true)));
      ref.invalidate(tasksProvider((done: true, mine: false)));
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

  /// The kind's own fields: what, when, where, who, case, details.
  List<Widget> _fields(Translator t, L10nFormats formats, TextStyle label) {
    final f = TaskKindForm.of(_kind);
    String k(String key) => t.t('tasks.f.$key');
    final phoneBad = _tried && normalizeTaskPhone(_contactPhone.text) == null;
    final emailBad = _tried &&
        _contactEmail.text.trim().isNotEmpty &&
        !_emailRe.hasMatch(_contactEmail.text.trim());
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
        child: AppListRow(
          key: const ValueKey('task-when'),
          icon: AppIcons.eventOutlined,
          label:
              _due == null ? t.t('tasks.field.date') : formats.dateTime(_due!),
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
      ),
      if (f.where != null) ...[
        const SizedBox(height: AppSpacing.lg),
        AppTextField(
          key: const ValueKey('task-location'),
          controller: _location,
          label: k(f.where!),
          leading: const AppIcon(AppIcons.placeOutlined),
          maxLength: 300,
        ),
      ],
      if (f.contact != null) ...[
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          key: const ValueKey('task-contact-name'),
          controller: _contactName,
          label: k(f.contact!),
          leading: const AppIcon(AppIcons.personOutlineRounded),
          textCapitalization: TextCapitalization.words,
          maxLength: 120,
        ),
      ],
      if (f.phone) ...[
        const SizedBox(height: AppSpacing.sm),
        AppTextField(
          key: const ValueKey('task-contact-phone'),
          controller: _contactPhone,
          label: t.t('tasks.field.contactPhone'),
          leading: const AppIcon(AppIcons.phoneOutlined),
          errorText: phoneBad ? t.t('tasks.field.phoneInvalid') : null,
          keyboardType: TextInputType.phone,
          inputFormatters: [
            FilteringTextInputFormatter.allow(RegExp(r'[+0-9 ()\-]')),
          ],
          maxLength: 32,
        ),
      ],
      if (f.email) ...[
        const SizedBox(height: AppSpacing.sm),
        AppTextField(
          key: const ValueKey('task-contact-email'),
          controller: _contactEmail,
          label: k('email'),
          leading: const AppIcon(AppIcons.mailOutlineRounded),
          keyboardType: TextInputType.emailAddress,
          errorText: emailBad ? t.t('tasks.emailInvalid') : null,
          maxLength: 254,
        ),
      ],
      if (f.caseLink) ...[
        const SizedBox(height: AppSpacing.md),
        AppCard(
          padding: EdgeInsets.zero,
          child: AppListRow(
            key: const ValueKey('task-case'),
            icon: AppIcons.workOutlineRounded,
            label: _case?.title ?? t.t('tasks.field.casePick'),
            subtitle: _case == null ? null : t.t('tasks.field.case'),
            onTap: _pickCase,
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
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.xxl,
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
                  TextButton.icon(
                    key: const ValueKey('task-editor-step-add'),
                    onPressed: () async {
                      FocusScope.of(context).unfocus();
                      final d = await showStepEditor(context, taskKind: _kind);
                      if (d != null && mounted) setState(() => _steps.add(d));
                    },
                    icon: AppIcon(AppIcons.addRounded, color: colors.goldDark),
                    label: Text(
                      t.t('tasks.steps.add'),
                      style: TextStyle(color: colors.goldDark),
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
              Text(t.t('tasks.field.files'), style: label),
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
                alignment: Alignment.centerLeft,
                child: TextButton.icon(
                  key: const ValueKey('task-attach'),
                  onPressed: _attach,
                  icon: const AppIcon(AppIcons.attachFileRounded),
                  label: Text(t.t('tasks.field.attach')),
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
          TextButton(
            key: const ValueKey('task-kind-change'),
            onPressed: onChange,
            child: Text(changeLabel),
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
              Text(
                label,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                textAlign: TextAlign.center,
                style: typography.caption.copyWith(
                  color: selected ? colors.text : colors.textSecondary,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

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
