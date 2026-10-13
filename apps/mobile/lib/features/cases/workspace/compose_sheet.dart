import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/upload_limits.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart'
    show ActionSheetItem, showActionSheet;
import 'package:lawbid/features/cases/workspace/workspace_data.dart';
import 'package:lawbid/features/team/presentation/task_pickers.dart'
    show showChoiceSheet, taskRemindChoices, taskRemindLabel;
import 'package:lawbid/features/team/presentation/task_sheet.dart'
    show pickDateTime;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-13: what the compose sheet returns.
class ComposeResult {
  const ComposeResult({
    required this.title,
    required this.text,
    required this.items,
    required this.files,
    this.kind,
    this.dueAt,
    this.remindBeforeMin,
  });

  final String title;
  final String text;

  /// Checklist lines (a task for the client).
  final List<String> items;
  final List<PickedCaseFile> files;
  final api.CreateCaseTaskDtoKind? kind;

  /// The calendar and the bell of the strip (attorney's tasks).
  final DateTime? dueAt;
  final int? remindBeforeMin;
}

enum ComposeMode { update, task, attach }

/// A half-height sheet (it stretches) for a new task or a new update, with
/// the strip above the keyboard of the iPhone's Notes: checklist, clip
/// (file / photo / sample), and for a task who it is for.
Future<ComposeResult?> showComposeSheet(
  BuildContext context, {
  required ComposeMode mode,
  required bool isAttorney,
}) =>
    showAppBottomSheet<ComposeResult>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ComposeSheet(mode: mode, isAttorney: isAttorney),
    );

class _Line {
  _Line({this.check = false, String text = ''})
      : c = TextEditingController(text: text),
        f = FocusNode();

  final TextEditingController c;
  final FocusNode f;
  bool check;

  void dispose() {
    c.dispose();
    f.dispose();
  }
}

class _ComposeSheet extends ConsumerStatefulWidget {
  const _ComposeSheet({required this.mode, required this.isAttorney});

  final ComposeMode mode;
  final bool isAttorney;

  @override
  ConsumerState<_ComposeSheet> createState() => _ComposeSheetState();
}

class _ComposeSheetState extends ConsumerState<_ComposeSheet> {
  final _title = TextEditingController();
  final _lines = <_Line>[_Line()];
  final _files = <PickedCaseFile>[];
  api.CreateCaseTaskDtoKind _kind = api.CreateCaseTaskDtoKind.forClient;
  int _focused = 0;
  DateTime? _due;
  int? _remind;
  final _sheet = DraggableScrollableController();
  bool _keyboardWas = false;

  bool get _task => widget.mode == ComposeMode.task;

  @override
  void dispose() {
    _sheet.dispose();
    _title.dispose();
    for (final l in _lines) {
      l.dispose();
    }
    super.dispose();
  }

  void _onLineChanged(int i, String v) {
    if (!v.contains('\n')) return;
    final line = _lines[i];
    final parts = v.split('\n');
    final head = parts.first;
    final rest = parts.skip(1).join('\n');
    // Enter on an empty checklist line leaves the list.
    if (line.check && head.trim().isEmpty && rest.isEmpty) {
      setState(() {
        line.c.text = '';
        line.check = false;
      });
      return;
    }
    line.c.text = head;
    final next = _Line(check: line.check, text: rest);
    setState(() => _lines.insert(i + 1, next));
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) next.f.requestFocus();
    });
  }

  void _toggleCheck() {
    if (_lines.isEmpty) return;
    final i = _focused.clamp(0, _lines.length - 1);
    setState(() => _lines[i].check = !_lines[i].check);
  }

  Future<void> _attach({required bool sample}) async {
    final upload = ref.read(uploadLimitsProvider)[UploadPlace.kase];
    final result = await FilePicker.pickFiles(
      type: FileType.custom,
      allowedExtensions: upload.documentExtensions,
      allowMultiple: true,
      withData: true,
    );
    final room = 20 - _files.length;
    final add = [
      for (final f in result?.files ?? const <PlatformFile>[])
        if (f.bytes != null)
          PickedCaseFile(bytes: f.bytes!, name: f.name, sample: sample),
    ].take(room);
    if (mounted) setState(() => _files.addAll(add));
  }

  Future<void> _attachPhoto({required bool sample}) async {
    final room = 20 - _files.length;
    if (room <= 0) return;
    final picked = await ImagePicker().pickMultiImage(
      maxWidth: 2048,
      maxHeight: 2048,
      imageQuality: 85,
      limit: room > 1 ? room : null,
    );
    final add = <PickedCaseFile>[
      for (final f in picked.take(room))
        PickedCaseFile(
          bytes: await f.readAsBytes(),
          name: f.name,
          sample: sample,
        ),
    ];
    if (mounted) setState(() => _files.addAll(add));
  }

  void _attachMenu() {
    final t = ref.read(translatorProvider);
    showActionSheet(context, [
      ActionSheetItem(
        icon: AppIcons.imageOutlined,
        label: t.t('cases.compose.photo'),
        onTap: () => _attachPhoto(sample: false),
      ),
      ActionSheetItem(
        icon: AppIcons.attachFileRounded,
        label: t.t('cases.compose.file'),
        onTap: () => _attach(sample: false),
      ),
      if ((_task || widget.mode == ComposeMode.attach) &&
          widget.isAttorney) ...[
        ActionSheetItem(
          icon: AppIcons.imageOutlined,
          label: t.t('cases.compose.samplePhoto'),
          onTap: () => _attachPhoto(sample: true),
        ),
        ActionSheetItem(
          icon: AppIcons.descriptionOutlined,
          label: t.t('cases.compose.sampleFile'),
          onTap: () => _attach(sample: true),
        ),
      ],
    ]);
  }

  Future<void> _pickDue() async {
    final d = await pickDateTime(context, initial: _due);
    if (d != null && mounted) setState(() => _due = d);
  }

  Future<void> _pickRemind() async {
    final t = ref.read(translatorProvider);
    if (_due == null) {
      await _pickDue();
      if (_due == null) return;
    }
    if (!mounted) return;
    final i = await showChoiceSheet(
      context,
      title: t.t('tasks.remind.title'),
      labels: [for (final m in taskRemindChoices) taskRemindLabel(t, m)],
      selected: taskRemindChoices.indexOf(_remind),
      keyPrefix: 'remind',
    );
    if (i != null && mounted) setState(() => _remind = taskRemindChoices[i]);
  }

  ComposeResult? _result() {
    final plain = [
      for (final l in _lines)
        if (!l.check) l.c.text,
    ].join('\n').trim();
    final items = [
      for (final l in _lines)
        if (l.check && l.c.text.trim().isNotEmpty) l.c.text.trim(),
    ];
    final title = _title.text.trim();
    if (_task && title.isEmpty) return null;
    if (!_task && plain.isEmpty && _files.isEmpty) return null;
    if (widget.mode == ComposeMode.attach && _files.isEmpty && plain.isEmpty) {
      return null;
    }
    return ComposeResult(
      title: title,
      text: plain,
      items: items,
      files: List.of(_files),
      kind: _task ? _kind : null,
      dueAt: _task ? _due : null,
      remindBeforeMin: _task && _due != null ? _remind : null,
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final keyboard = MediaQuery.viewInsetsOf(context).bottom;
    // The keyboard takes the lower part: the sheet stretches to what is
    // left, so the field and the strip are both above it.
    if ((keyboard > 0) != _keyboardWas) {
      _keyboardWas = keyboard > 0;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted || !_sheet.isAttached) return;
        _sheet.animateTo(
          _keyboardWas ? 1 : 0.62,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOut,
        );
      });
    }
    final ready = _result() != null;
    final kinds = [
      (api.CreateCaseTaskDtoKind.forClient, t.t('cases.tasks.forClient')),
      (api.CreateCaseTaskDtoKind.shared, t.t('cases.tasks.shared')),
      (api.CreateCaseTaskDtoKind.private, t.t('cases.tasks.private')),
    ];
    return Padding(
      padding: EdgeInsets.only(bottom: keyboard),
      child: DraggableScrollableSheet(
        controller: _sheet,
        expand: false,
        initialChildSize: 0.62,
        minChildSize: 0.4,
        builder: (context, scroll) => Column(
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.symmetric(
                horizontal: AppSpacing.lg,
                vertical: AppSpacing.xs,
              ),
              child: Row(
                children: [
                  TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: Text(t.t('common.cancel')),
                  ),
                  Expanded(
                    child: Text(
                      t.t(
                        switch (widget.mode) {
                          ComposeMode.task => 'cases.compose.newTask',
                          ComposeMode.attach => 'cases.compose.addFiles',
                          _ => 'cases.compose.newUpdate',
                        },
                      ),
                      textAlign: TextAlign.center,
                      style: type.body.copyWith(fontWeight: FontWeight.w700),
                    ),
                  ),
                  TextButton(
                    onPressed: ready
                        ? () => Navigator.of(context).pop(_result())
                        : null,
                    child: Text(
                      t.t(
                        _task ? 'cases.compose.create' : 'cases.compose.send',
                      ),
                      style: TextStyle(
                        fontWeight: FontWeight.w700,
                        color: ready ? colors.goldDark : colors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: ListView(
                controller: scroll,
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.lg,
                  0,
                  AppSpacing.lg,
                  AppSpacing.lg,
                ),
                children: [
                  if (_task && widget.isAttorney) ...[
                    Wrap(
                      spacing: 8,
                      children: [
                        for (final (k, label) in kinds)
                          ChoiceChip(
                            label: Text(label),
                            selected: _kind == k,
                            onSelected: (_) => setState(() => _kind = k),
                          ),
                      ],
                    ),
                    const SizedBox(height: 6),
                    Text(
                      t.t(
                        switch (_kind) {
                          api.CreateCaseTaskDtoKind.forClient =>
                            'cases.tasks.forClientHint',
                          api.CreateCaseTaskDtoKind.shared =>
                            'cases.tasks.sharedHint',
                          _ => 'cases.tasks.privateHint',
                        },
                      ),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  if (_task)
                    TextField(
                      controller: _title,
                      maxLength: 200,
                      textCapitalization: TextCapitalization.sentences,
                      onChanged: (_) => setState(() {}),
                      style: type.body.copyWith(
                        fontWeight: FontWeight.w700,
                        fontSize: 18,
                      ),
                      decoration: InputDecoration(
                        hintText: t.t('cases.compose.titleHint'),
                        border: InputBorder.none,
                        counterText: '',
                      ),
                    ),
                  for (final (i, l) in _lines.indexed)
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (l.check)
                          Padding(
                            padding: const EdgeInsets.only(top: 12, right: 10),
                            child: Container(
                              width: 20,
                              height: 20,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                border: Border.all(
                                  color: colors.textSecondary,
                                  width: 1.6,
                                ),
                              ),
                            ),
                          ),
                        Expanded(
                          child: Focus(
                            onFocusChange: (has) {
                              if (has) _focused = i;
                            },
                            child: TextField(
                              controller: l.c,
                              focusNode: l.f,
                              autofocus: i == 0 && !_task,
                              minLines: 1,
                              maxLines: null,
                              maxLength: 5000,
                              keyboardType: TextInputType.multiline,
                              textCapitalization: TextCapitalization.sentences,
                              onChanged: (v) {
                                _onLineChanged(i, v);
                                setState(() {});
                              },
                              style:
                                  type.body.copyWith(fontSize: 16, height: 1.4),
                              decoration: InputDecoration(
                                hintText: i == 0
                                    ? t.t(
                                        switch (widget.mode) {
                                          ComposeMode.task =>
                                            'cases.compose.taskHint',
                                          ComposeMode.attach =>
                                            'cases.compose.noteHint',
                                          _ => 'cases.compose.updateHint',
                                        },
                                      )
                                    : null,
                                border: InputBorder.none,
                                counterText: '',
                                isDense: true,
                                contentPadding: const EdgeInsets.symmetric(
                                  vertical: 10,
                                ),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  if (_task && (_due != null || _remind != null))
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          if (_due != null)
                            InputChip(
                              avatar: AppIcon(
                                AppIcons.eventOutlined,
                                size: 16,
                                color: colors.text,
                              ),
                              label: Text(
                                ref.read(l10nFormatsProvider).dateTime(_due!),
                              ),
                              onPressed: _pickDue,
                              onDeleted: () => setState(() {
                                _due = null;
                                _remind = null;
                              }),
                            ),
                          if (_due != null && _remind != null)
                            InputChip(
                              avatar: AppIcon(
                                AppIcons.notificationsActiveOutlined,
                                size: 16,
                                color: colors.text,
                              ),
                              label: Text(taskRemindLabel(t, _remind)),
                              onPressed: _pickRemind,
                              onDeleted: () => setState(() => _remind = null),
                            ),
                        ],
                      ),
                    ),
                  for (final (i, f) in _files.indexed)
                    _PickedTile(
                      file: f,
                      showSample:
                          (_task || widget.mode == ComposeMode.attach) &&
                              widget.isAttorney,
                      onRemove: () => setState(() => _files.removeAt(i)),
                      onChanged: () => setState(() {}),
                    ),
                ],
              ),
            ),
            // The strip above the keyboard.
            Container(
              decoration: BoxDecoration(
                color: colors.surface,
                border: Border(top: BorderSide(color: colors.border)),
              ),
              padding: EdgeInsets.fromLTRB(
                AppSpacing.md,
                4,
                AppSpacing.md,
                keyboard > 0 ? 4 : MediaQuery.paddingOf(context).bottom + 4,
              ),
              child: Row(
                children: [
                  if (_task)
                    IconButton(
                      tooltip: t.t('cases.compose.checklist'),
                      onPressed: _toggleCheck,
                      icon: AppIcon(
                        AppIcons.checkCircleOutlineRounded,
                        color: _lines.isNotEmpty &&
                                _focused < _lines.length &&
                                _lines[_focused].check
                            ? colors.goldDark
                            : colors.text,
                      ),
                    ),
                  IconButton(
                    tooltip: t.t('cases.compose.attach'),
                    onPressed: _attachMenu,
                    icon:
                        AppIcon(AppIcons.attachFileRounded, color: colors.text),
                  ),
                  if (_task && widget.isAttorney) ...[
                    IconButton(
                      tooltip: t.t('cases.compose.due'),
                      onPressed: _pickDue,
                      icon: AppIcon(
                        AppIcons.eventOutlined,
                        color: _due != null ? colors.goldDark : colors.text,
                      ),
                    ),
                    IconButton(
                      tooltip: t.t('cases.compose.remind'),
                      onPressed: _pickRemind,
                      icon: AppIcon(
                        AppIcons.notificationsActiveOutlined,
                        color: _remind != null ? colors.goldDark : colors.text,
                      ),
                    ),
                  ],
                  const Spacer(),
                  if (_files.isNotEmpty)
                    Text(
                      '${_files.length} / 20',
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _PickedTile extends ConsumerWidget {
  const _PickedTile({
    required this.file,
    required this.showSample,
    required this.onRemove,
    required this.onChanged,
  });

  final PickedCaseFile file;
  final bool showSample;
  final VoidCallback onRemove;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      margin: const EdgeInsets.only(top: AppSpacing.sm),
      padding: const EdgeInsets.all(AppSpacing.sm),
      decoration: BoxDecoration(
        color: colors.border.withValues(alpha: 0.35),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: SizedBox.square(
              dimension: 44,
              child: file.isImage
                  ? Image.memory(file.bytes, fit: BoxFit.cover)
                  : ColoredBox(
                      color: colors.surface,
                      child: AppIcon(
                        AppIcons.descriptionOutlined,
                        color: colors.text,
                      ),
                    ),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        file.name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.bodySmall
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                    if (file.sample)
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 7,
                          vertical: 2,
                        ),
                        decoration: BoxDecoration(
                          color: colors.gold.withValues(alpha: 0.25),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(
                          t.t('cases.files.sample'),
                          style: type.caption
                              .copyWith(fontWeight: FontWeight.w700),
                        ),
                      ),
                  ],
                ),
                TextField(
                  controller: TextEditingController(text: file.description)
                    ..selection = TextSelection.collapsed(
                      offset: file.description.length,
                    ),
                  maxLength: 500,
                  maxLines: null,
                  textCapitalization: TextCapitalization.sentences,
                  onChanged: (v) => file.description = v,
                  style: type.bodySmall,
                  decoration: InputDecoration(
                    hintText: t.t('cases.compose.fileNoteHint'),
                    isDense: true,
                    border: InputBorder.none,
                    contentPadding: const EdgeInsets.symmetric(vertical: 4),
                  ),
                ),
              ],
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            onPressed: onRemove,
            icon: AppIcon(
              AppIcons.closeRounded,
              size: 18,
              color: colors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
