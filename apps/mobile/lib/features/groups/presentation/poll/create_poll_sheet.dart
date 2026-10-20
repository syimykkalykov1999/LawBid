import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_logic.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Opens the «New poll» sheet; resolves to true when the poll was sent.
Future<bool> showCreatePollSheet(
  BuildContext context, {
  required String groupId,
  String? topicId,
}) async {
  final sent = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (context) => _CreatePollSheet(groupId: groupId, topicId: topicId),
  );
  return sent ?? false;
}

/// One option field with a stable key so reordering keeps its text.
class _OptionDraft {
  _OptionDraft()
      : key = UniqueKey(),
        controller = TextEditingController();

  final Key key;
  final TextEditingController controller;
}

class _CreatePollSheet extends ConsumerStatefulWidget {
  const _CreatePollSheet({required this.groupId, this.topicId});

  final String groupId;
  final String? topicId;

  @override
  ConsumerState<_CreatePollSheet> createState() => _CreatePollSheetState();
}

class _CreatePollSheetState extends ConsumerState<_CreatePollSheet> {
  final _question = TextEditingController();
  final List<_OptionDraft> _options = [_OptionDraft(), _OptionDraft()];
  bool _anonymous = true;
  bool _multiple = false;
  bool _sending = false;
  bool _touched = false;

  @override
  void dispose() {
    _question.dispose();
    for (final o in _options) {
      o.controller.dispose();
    }
    super.dispose();
  }

  List<String> get _texts => [for (final o in _options) o.controller.text];

  Set<PollIssue> get _issues => validatePollDraft(_question.text, _texts);

  void _addOption() {
    if (_options.length >= kPollOptionsMax) return;
    setState(() => _options.add(_OptionDraft()));
  }

  void _removeOption(int index) {
    if (_options.length <= kPollOptionsMin) return;
    setState(() => _options.removeAt(index).controller.dispose());
  }

  void _reorder(int oldIndex, int newIndex) {
    setState(() {
      _options.insert(newIndex, _options.removeAt(oldIndex));
    });
  }

  Future<void> _send() async {
    setState(() => _touched = true);
    if (_issues.isNotEmpty || _sending) return;
    final t = ref.read(translatorProvider);
    final repo = ref.read(groupRepositoryProvider);
    final navigator = Navigator.of(context);
    setState(() => _sending = true);
    try {
      await repo.createPoll(
        widget.groupId,
        api.CreatePollDto(
          clientMessageId: 'p${DateTime.now().microsecondsSinceEpoch}',
          question: _question.text.trim(),
          options: cleanPollOptions(_texts),
          multiple: _multiple,
          anonymous: _anonymous,
          topicId: widget.topicId,
        ),
      );
      if (!mounted) return;
      navigator.pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _sending = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final media = MediaQuery.of(context);
    final issues = _issues;
    final valid = issues.isEmpty;
    final questionError = _touched && issues.contains(PollIssue.questionEmpty)
        ? t.t('poll.error.question')
        : null;
    final optionsError = _touched && issues.contains(PollIssue.tooFewOptions)
        ? t.t('poll.error.options')
        : (issues.contains(PollIssue.duplicateOptions)
            ? t.t('poll.error.duplicates')
            : null);
    return Padding(
      padding: EdgeInsets.only(bottom: media.viewInsets.bottom),
      child: SafeArea(
        child: SizedBox(
          height: media.size.height * 0.9 - media.viewInsets.bottom > 320
              ? media.size.height * 0.9 - media.viewInsets.bottom
              : 320,
          child: Column(
            children: [
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.screenSide,
                  AppSpacing.md,
                  AppSpacing.screenSide,
                  0,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const AppSheetHandle(),
                    Text(
                      t.t('poll.new'),
                      style: typography.titleMedium.copyWith(
                        color: colors.text,
                      ),
                    ),
                  ],
                ),
              ),
              Expanded(
                child: ListView(
                  keyboardDismissBehavior:
                      ScrollViewKeyboardDismissBehavior.onDrag,
                  padding: const EdgeInsetsDirectional.fromSTEB(
                    AppSpacing.screenSide,
                    AppSpacing.md,
                    AppSpacing.screenSide,
                    AppSpacing.md,
                  ),
                  children: [
                    AppTextField(
                      controller: _question,
                      label: t.t('poll.question'),
                      hintText: t.t('poll.question.hint'),
                      maxLength: kPollQuestionMax,
                      maxLines: 3,
                      minHeight: 52,
                      textCapitalization: TextCapitalization.sentences,
                      errorText: questionError,
                      enabled: !_sending,
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      t.t('poll.options'),
                      style: typography.bodySmall.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    ReorderableListView(
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      buildDefaultDragHandles: false,
                      onReorderItem: _reorder,
                      children: [
                        for (var i = 0; i < _options.length; i++)
                          _OptionField(
                            key: _options[i].key,
                            index: i,
                            draft: _options[i],
                            hint: t.t('poll.option.hint', {'n': '${i + 1}'}),
                            removeLabel: t.t('poll.option.remove'),
                            dragLabel: t.t('poll.option.drag'),
                            canRemove: _options.length > kPollOptionsMin,
                            enabled: !_sending,
                            onChanged: () => setState(() {}),
                            onRemove: () => _removeOption(i),
                          ),
                      ],
                    ),
                    if (optionsError != null)
                      Padding(
                        padding: const EdgeInsets.only(top: AppSpacing.xs),
                        child: Text(
                          optionsError,
                          style: typography.caption.copyWith(
                            color: colors.dangerText,
                          ),
                        ),
                      ),
                    if (_options.length < kPollOptionsMax)
                      _AddOptionRow(
                        label: t.t('poll.option.add'),
                        onTap: _sending ? null : _addOption,
                      )
                    else
                      Padding(
                        padding: const EdgeInsets.symmetric(
                          vertical: AppSpacing.sm,
                        ),
                        child: Text(
                          t.t('poll.option.max', {'max': '$kPollOptionsMax'}),
                          style: typography.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      ),
                    const SizedBox(height: AppSpacing.sm),
                    _SwitchRow(
                      title: t.t('poll.anonymous.switch'),
                      subtitle: t.t(
                        _anonymous
                            ? 'poll.anonymous.hintOn'
                            : 'poll.anonymous.hintOff',
                      ),
                      value: _anonymous,
                      onChanged: _sending
                          ? null
                          : (v) => setState(() => _anonymous = v),
                    ),
                    _SwitchRow(
                      title: t.t('poll.multiple.switch'),
                      subtitle: t.t('poll.multiple.hint'),
                      value: _multiple,
                      onChanged: _sending
                          ? null
                          : (v) => setState(() => _multiple = v),
                    ),
                  ],
                ),
              ),
              Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.md,
                ),
                child: AppButton(
                  label: t.t('poll.send'),
                  isEnabled: valid,
                  isLoading: _sending,
                  onPressed: _send,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OptionField extends StatelessWidget {
  const _OptionField({
    required super.key,
    required this.index,
    required this.draft,
    required this.hint,
    required this.removeLabel,
    required this.dragLabel,
    required this.canRemove,
    required this.enabled,
    required this.onChanged,
    required this.onRemove,
  });

  final int index;
  final _OptionDraft draft;
  final String hint;
  final String removeLabel;
  final String dragLabel;
  final bool canRemove;
  final bool enabled;
  final VoidCallback onChanged;
  final VoidCallback onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          Expanded(
            child: AppTextField(
              controller: draft.controller,
              hintText: hint,
              semanticLabel: hint,
              maxLength: kPollOptionMax,
              enabled: enabled,
              textCapitalization: TextCapitalization.sentences,
              onChanged: (_) => onChanged(),
            ),
          ),
          Semantics(
            button: true,
            label: removeLabel,
            excludeSemantics: true,
            child: IconButton(
              constraints: const BoxConstraints(
                minWidth: AppSizes.touchTarget,
                minHeight: AppSizes.touchTarget,
              ),
              tooltip: removeLabel,
              onPressed: canRemove && enabled ? onRemove : null,
              icon: Icon(
                AppIcons.closeRounded,
                size: AppSizes.iconMd,
                color: colors.textSecondary,
              ),
            ),
          ),
          Semantics(
            label: dragLabel,
            child: ReorderableDragStartListener(
              index: index,
              enabled: enabled,
              child: SizedBox(
                width: AppSizes.touchTarget,
                height: AppSizes.touchTarget,
                child: Icon(
                  AppIcons.dragIndicatorRounded,
                  size: AppSizes.iconMd,
                  color: colors.textSecondary,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _AddOptionRow extends StatelessWidget {
  const _AddOptionRow({required this.label, required this.onTap});

  final String label;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.button),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Row(
            children: [
              Icon(
                AppIcons.addRounded,
                size: AppSizes.iconMd,
                color: colors.text,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  label,
                  style: typography.body.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _SwitchRow extends StatelessWidget {
  const _SwitchRow({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool>? onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return MergeSemantics(
      child: ConstrainedBox(
        constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: typography.body.copyWith(color: colors.text),
                  ),
                  Text(
                    subtitle,
                    style: typography.caption.copyWith(
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
            Switch.adaptive(value: value, onChanged: onChanged),
          ],
        ),
      ),
    );
  }
}
