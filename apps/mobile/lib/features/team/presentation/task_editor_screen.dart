import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/chat/presentation/attachment_widgets.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/team/presentation/task_sheet.dart';
import 'package:lawbid/features/team/presentation/task_widgets.dart';
import 'package:lawbid/features/team/presentation/task_kind_form.dart';
import 'package:lawbid/core/l10n/translator.dart';

/// OQ-048 (owner 2026-09-30): a new task — set by an assistant for the
/// attorney or by the attorney for themself: what (call, meeting, court,
/// deadline, documents, print, visit, other), when, where, who, which
/// case, details and documents.
class TaskEditorScreen extends ConsumerStatefulWidget {
  const TaskEditorScreen({this.initialKind, super.key});

  final TaskKind? initialKind;

  @override
  ConsumerState<TaskEditorScreen> createState() => _TaskEditorScreenState();
}

typedef _Attachment = ({String name, String? fileId, bool failed});

class _TaskEditorScreenState extends ConsumerState<TaskEditorScreen> {
  late TaskKind _kind = widget.initialKind ?? TaskKind.call;
  final _title = TextEditingController();
  final _location = TextEditingController();
  final _contactName = TextEditingController();
  final _contactPhone = TextEditingController();
  final _contactEmail = TextEditingController();
  final _notes = TextEditingController();
  DateTime? _due;
  WorkItem? _case;
  final List<_Attachment> _files = [];
  int _uploading = 0;
  bool _saving = false;
  bool _tried = false;

  @override
  void dispose() {
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
              () => _files[index] = (name: f.name, fileId: id, failed: false));
        }
      } on Object {
        if (mounted) {
          setState(
              () => _files[index] = (name: f.name, fileId: null, failed: true));
        }
      } finally {
        if (mounted) setState(() => _uploading--);
      }
    }
  }

  Future<void> _pickCase() async {
    final t = ref.read(translatorProvider);
    final picked = await showAppBottomSheet<WorkItem>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => Consumer(
        builder: (ctx, ref, _) {
          final value = ref.watch(myWorkProvider(WorkFilter.active));
          final items = value.value?.items ?? const <WorkItem>[];
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(ctx).height * 0.6,
              ),
              child: value.isLoading && items.isEmpty
                  ? const Padding(
                      padding: EdgeInsets.all(AppSpacing.xl),
                      child: Center(child: CircularProgressIndicator()),
                    )
                  : items.isEmpty
                      ? AppEmptyState(
                          icon: Icons.work_outline_rounded,
                          message: t.t('mine.work.empty'),
                        )
                      : ListView(
                          shrinkWrap: true,
                          children: [
                            for (final w in items)
                              AppListRow(
                                icon: Icons.work_outline_rounded,
                                label: w.title,
                                selected: _case?.caseId == w.caseId,
                                onTap: () => Navigator.of(ctx).pop(w),
                              ),
                          ],
                        ),
            ),
          );
        },
      ),
    );
    if (picked != null) setState(() => _case = picked);
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    setState(() => _tried = true);
    if (_title.text.trim().isEmpty || _uploading > 0) return;
    final form = TaskKindForm.of(_kind);
    if (form.email &&
        _contactEmail.text.trim().isNotEmpty &&
        !_emailRe.hasMatch(_contactEmail.text.trim())) {
      return;
    }
    setState(() => _saving = true);
    try {
      await ref.read(teamRepositoryProvider).createTask(TaskDraft(
            kind: _kind,
            title: _title.text.trim(),
            notes: _clean(_notes),
            dueAt: _due,
            location: form.where != null ? _clean(_location) : null,
            caseId: _case?.caseId,
            contactName: form.contact != null ? _clean(_contactName) : null,
            contactPhone: form.phone ? _clean(_contactPhone) : null,
            contactEmail: form.email ? _clean(_contactEmail) : null,
            fileIds: [
              for (final f in _files)
                if (f.fileId != null) f.fileId!,
            ],
          ));
      ref.invalidate(tasksProvider((done: false, mine: false)));
      ref.invalidate(tasksProvider((done: false, mine: true)));
      if (!mounted) return;
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
          icon: Icons.event_outlined,
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
          leading: const Icon(Icons.place_outlined),
          maxLength: 300,
        ),
      ],
      if (f.contact != null) ...[
        const SizedBox(height: AppSpacing.md),
        AppTextField(
          key: const ValueKey('task-contact-name'),
          controller: _contactName,
          label: k(f.contact!),
          leading: const Icon(Icons.person_outline_rounded),
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
          leading: const Icon(Icons.phone_outlined),
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
          leading: const Icon(Icons.mail_outline_rounded),
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
            icon: Icons.work_outline_rounded,
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
        title: Text(t.t(assistant ? 'tasks.forAttorney' : 'tasks.forMe')),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.xxl,
        ),
        children: [
          Text(t.t('tasks.field.kind'), style: label),
          const SizedBox(height: AppSpacing.sm),
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
                    setState(() => _kind = k);
                  },
                ),
            ],
          ),
          const SizedBox(height: AppSpacing.lg),
          // Owner 2026-10-01: the fields below follow the kind of task.
          ..._fields(t, formats, label),
          if (TaskKindForm.of(_kind).files) ...[
            Text(t.t('tasks.field.files'), style: label),
            const SizedBox(height: AppSpacing.sm),
            for (final (i, f) in _files.indexed)
              Padding(
                padding: const EdgeInsets.only(bottom: AppSpacing.xs),
                child: Row(
                  children: [
                    Icon(
                      f.failed
                          ? Icons.error_outline_rounded
                          : f.fileId == null
                              ? Icons.cloud_upload_outlined
                              : Icons.check_circle_outline_rounded,
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
                        icon: const Icon(Icons.close_rounded),
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
                icon: const Icon(Icons.attach_file_rounded),
                label: Text(t.t('tasks.field.attach')),
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          AppButton(
            key: const ValueKey('task-save'),
            label: t.t('tasks.save'),
            icon: Icons.check_rounded,
            isLoading: _saving || _uploading > 0,
            onPressed: _save,
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
              Icon(icon, color: selected ? colors.gold : colors.textSecondary),
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
