import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_style.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The «New topic» / «Edit topic» sheet. Creates a topic when [topic] is
/// null, else edits it (title, icon, colour, closed, pinned; «General»
/// only takes «pinned»). Resolves to true when something was saved.
Future<bool> showTopicEditorSheet(
  BuildContext context, {
  required String groupId,
  api.GroupTopicDto? topic,
}) async {
  final saved = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) => _TopicEditor(groupId: groupId, topic: topic),
  );
  return saved ?? false;
}

class _TopicEditor extends ConsumerStatefulWidget {
  const _TopicEditor({required this.groupId, required this.topic});

  final String groupId;
  final api.GroupTopicDto? topic;

  @override
  ConsumerState<_TopicEditor> createState() => _TopicEditorState();
}

class _TopicEditorState extends ConsumerState<_TopicEditor> {
  static const _quick = [
    '💬',
    '📌',
    '📢',
    '❓',
    '💡',
    '📄',
    '⚖️',
    '💼',
    '🎉',
    '🔥',
    '✅',
    '📅',
  ];

  late final _title = TextEditingController(text: widget.topic?.title ?? '');
  late final _emoji =
      TextEditingController(text: widget.topic?.iconEmoji ?? '');
  late int _color = widget.topic?.color.toInt() ?? 0;
  late bool _closed = widget.topic?.closed ?? false;
  late bool _pinned = widget.topic?.pinned ?? false;
  bool _busy = false;

  bool get _editing => widget.topic != null;
  bool get _general => widget.topic?.isGeneral ?? false;

  @override
  void dispose() {
    _title.dispose();
    _emoji.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    final title = _title.text.trim();
    if (!_general && title.isEmpty) return;
    setState(() => _busy = true);
    final repo = ref.read(groupRepositoryProvider);
    final emoji = _emoji.text.trim();
    try {
      final topic = widget.topic;
      if (topic == null) {
        await repo.createTopic(
          widget.groupId,
          api.CreateTopicDto(
            title: title,
            iconEmoji: emoji.isEmpty ? null : emoji,
            color: _color,
          ),
        );
      } else {
        await repo.updateTopic(
          widget.groupId,
          topic.id,
          _general
              ? api.UpdateTopicDto(pinned: _pinned)
              : api.UpdateTopicDto(
                  title: title,
                  iconEmoji: emoji,
                  color: _color,
                  closed: _closed,
                  pinned: _pinned,
                ),
        );
      }
      if (!mounted) return;
      ref.invalidate(groupTopicsProvider(widget.groupId));
      Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget toggle(
      String key, {
      required bool value,
      required ValueChanged<bool> onChanged,
    }) =>
        Row(
          children: [
            Expanded(
              child: Text(
                t.t(key),
                style: type.body.copyWith(color: colors.text),
              ),
            ),
            Switch.adaptive(
              value: value,
              onChanged: _busy ? null : onChanged,
            ),
          ],
        );

    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            0,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: AppSheetHandle()),
              Text(
                t.t(_editing ? 'group.topic.edit' : 'group.topic.new'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.lg),
              if (!_general) ...[
                AppTextField(
                  controller: _title,
                  label: t.t('group.topic.title'),
                  maxLength: 64,
                  autofocus: !_editing,
                  textCapitalization: TextCapitalization.sentences,
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: AppSpacing.md),
                AppTextField(
                  controller: _emoji,
                  label: t.t('group.topic.emoji'),
                  maxLength: 16,
                ),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (final e in _quick)
                      Semantics(
                        button: true,
                        label: e,
                        child: AppPressable(
                          onTap: () => setState(() => _emoji.text = e),
                          child: Container(
                            width: AppSizes.touchTarget,
                            height: AppSizes.touchTarget,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: _emoji.text == e
                                  ? colors.goldTint
                                  : colors.bg,
                              border: Border.all(
                                color: _emoji.text == e
                                    ? colors.gold
                                    : colors.border,
                              ),
                            ),
                            child: Text(
                              e,
                              style: Theme.of(context).textTheme.titleLarge,
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.lg),
                Text(
                  t.t('group.topic.color'),
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.sm),
                Wrap(
                  spacing: AppSpacing.sm,
                  runSpacing: AppSpacing.sm,
                  children: [
                    for (var i = 0; i < kGroupTopicColorCount; i++)
                      Semantics(
                        button: true,
                        selected: _color == i,
                        label: context.digits(i + 1),
                        child: AppPressable(
                          onTap: () => setState(() => _color = i),
                          child: Container(
                            width: AppSizes.touchTarget,
                            height: AppSizes.touchTarget,
                            decoration: BoxDecoration(
                              shape: BoxShape.circle,
                              color: groupTopicColor(i),
                              border: Border.all(
                                color: _color == i
                                    ? colors.text
                                    : Colors.transparent,
                                width: 2,
                              ),
                            ),
                            child: _color == i
                                ? const AppIcon(
                                    AppIcons.checkRounded,
                                    color: Colors.white,
                                  )
                                : null,
                          ),
                        ),
                      ),
                  ],
                ),
                const SizedBox(height: AppSpacing.md),
              ],
              if (_editing) ...[
                if (!_general)
                  toggle(
                    'group.topic.closed',
                    value: _closed,
                    onChanged: (v) => setState(() => _closed = v),
                  ),
                toggle(
                  'group.topic.pinned',
                  value: _pinned,
                  onChanged: (v) => setState(() => _pinned = v),
                ),
                const SizedBox(height: AppSpacing.md),
              ],
              ListenableBuilder(
                listenable: _title,
                builder: (context, _) => AppButton(
                  label:
                      t.t(_editing ? 'group.topic.save' : 'group.topic.create'),
                  isLoading: _busy,
                  onPressed: _busy || (!_general && _title.text.trim().isEmpty)
                      ? null
                      : _save,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
