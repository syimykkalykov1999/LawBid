import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/limits/text_limits.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_mention_picker.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_style.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The message field of a group chat: multi-line text, «+» (photo, file,
/// poll), a reply bar or an edit bar above it, and the @mention list that
/// opens while typing «@». Send and edit are reported to the screen; the
/// field clears itself after.
class GroupComposer extends ConsumerStatefulWidget {
  const GroupComposer({
    required this.controller,
    required this.members,
    required this.onSend,
    required this.onSaveEdit,
    required this.onAttach,
    this.canAttach = true,
    this.replyTo,
    this.editing,
    this.onCancelReply,
    this.onCancelEdit,
    this.uploading = false,
    super.key,
  });

  /// The field's text; the screen owns it so a file can take it as its
  /// caption.
  final TextEditingController controller;
  final List<api.GroupMemberDto> members;

  /// A new message with the ids of the people mentioned in it.
  final void Function(String text, List<String> mentionIds) onSend;

  /// The new text of the message being edited.
  final void Function(String text) onSaveEdit;
  final VoidCallback onAttach;

  /// False hides «+» (no media and no polls for me in this group).
  final bool canAttach;
  final api.GroupMessageDto? replyTo;
  final api.GroupMessageDto? editing;
  final VoidCallback? onCancelReply;
  final VoidCallback? onCancelEdit;

  /// A file is being uploaded (a thin progress line over the field).
  final bool uploading;

  @override
  ConsumerState<GroupComposer> createState() => _GroupComposerState();
}

class _GroupComposerState extends ConsumerState<GroupComposer> {
  TextEditingController get _text => widget.controller;
  final _focus = FocusNode();

  /// userId -> the «@Name» that was inserted for them.
  final Map<String, String> _picked = {};

  /// The text after an «@» being typed, or null.
  String? _query;

  @override
  void initState() {
    super.initState();
    _text.addListener(_onTextChanged);
  }

  @override
  void didUpdateWidget(GroupComposer old) {
    super.didUpdateWidget(old);
    final editing = widget.editing;
    if (editing != null && editing.id != old.editing?.id) {
      _text.value = TextEditingValue(
        text: editing.body,
        selection: TextSelection.collapsed(offset: editing.body.length),
      );
      _focus.requestFocus();
    } else if (editing == null && old.editing != null) {
      _text.clear();
    }
    if (widget.replyTo != null && widget.replyTo?.id != old.replyTo?.id) {
      _focus.requestFocus();
    }
  }

  @override
  void dispose() {
    _text.removeListener(_onTextChanged);
    _focus.dispose();
    super.dispose();
  }

  static final _mentionToken = RegExp(r'(?:^|\s)@([^\s@]{0,32})$');

  void _onTextChanged() {
    final v = _text.value;
    String? query;
    if (widget.editing == null &&
        v.selection.isValid &&
        v.selection.isCollapsed) {
      final before = v.text.substring(0, v.selection.start);
      query = _mentionToken.firstMatch(before)?.group(1);
    }
    if (query == _query) return;
    // The field can change while the parent builds (edit mode): never
    // rebuild this widget from inside that.
    if (WidgetsBinding.instance.schedulerPhase ==
        SchedulerPhase.persistentCallbacks) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _onTextChanged();
      });
      return;
    }
    setState(() => _query = query);
  }

  List<api.GroupMemberDto> _candidates(String query) {
    final t = ref.read(translatorProvider);
    final me = ref.read(currentUserIdProvider);
    final q = query.toLowerCase();
    return [
      for (final m in widget.members)
        if (m.userId != me &&
            (q.isEmpty ||
                groupMemberName(t, m).toLowerCase().contains(q) ||
                (m.username ?? '').toLowerCase().contains(q)))
          m,
    ].take(40).toList();
  }

  void _pick(api.GroupMemberDto m) {
    final t = ref.read(translatorProvider);
    final v = _text.value;
    final caret = v.selection.start;
    final query = _query ?? '';
    final start = caret - query.length - 1;
    if (start < 0) return;
    final name = groupMemberName(t, m);
    final token = name.startsWith('@') ? name : '@$name';
    final inserted = '$token ';
    final text = v.text.replaceRange(start, caret, inserted);
    _picked[m.userId] = token;
    _text.value = TextEditingValue(
      text: text,
      selection: TextSelection.collapsed(offset: start + inserted.length),
    );
    _focus.requestFocus();
  }

  void _submit() {
    final text = _text.text.trim();
    if (text.isEmpty) return;
    HapticFeedback.lightImpact();
    if (widget.editing != null) {
      widget.onSaveEdit(text);
    } else {
      final ids = [
        for (final e in _picked.entries)
          if (text.contains(e.value)) e.key,
      ];
      widget.onSend(text, ids);
    }
    _picked.clear();
    _text.clear();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final editing = widget.editing;
    final reply = widget.replyTo;
    final query = _query;
    final candidates =
        query == null ? const <api.GroupMemberDto>[] : _candidates(query);
    final maxChars = TextLimits.of(TextLimit.chatMessage);
    final counterFrom = (maxChars * 0.9).ceil();

    Widget bar({
      required IconData icon,
      required String title,
      required String text,
      required VoidCallback? onClose,
    }) =>
        Container(
          padding: const EdgeInsetsDirectional.only(
            start: AppSpacing.md,
            top: AppSpacing.xs,
            bottom: AppSpacing.xs,
          ),
          child: Row(
            children: [
              AppIcon(icon, size: 20, color: colors.iconTint),
              const SizedBox(width: AppSpacing.sm),
              Container(width: 2, height: 30, color: colors.goldDark),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(
                      title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: colors.goldDark,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    Text(
                      text,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(color: colors.text),
                    ),
                  ],
                ),
              ),
              AppIconButton(
                icon: AppIcon(
                  AppIcons.closeRounded,
                  size: 20,
                  color: colors.textSecondary,
                ),
                semanticLabel: t.t('common.close'),
                onPressed: onClose,
              ),
            ],
          ),
        );

    final field = ListenableBuilder(
      listenable: _text,
      builder: (context, _) {
        final near = _text.text.characters.length >= counterFrom;
        return InsideCounter(
          controller: _text,
          max: maxChars,
          showFrom: counterFrom,
          child: TextField(
            controller: _text,
            focusNode: _focus,
            onTapOutside: hideKeyboardOnTapOutside,
            minLines: 1,
            maxLines: 5,
            maxLength: maxChars,
            buildCounter: noFieldCounter,
            textCapitalization: TextCapitalization.sentences,
            style: type.body.copyWith(color: colors.text),
            decoration: InputDecoration(
              hintText: t.t('chat.hint'),
              filled: true,
              fillColor: colors.bg,
              contentPadding: EdgeInsets.fromLTRB(
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md,
                AppSpacing.md + (near ? kInsideCounterRoom : 0),
              ),
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(color: colors.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(color: colors.border),
              ),
              focusedBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(24),
                borderSide: BorderSide(color: colors.gold),
              ),
            ),
          ),
        );
      },
    );

    return TextFieldTapRegion(
      child: Material(
        color: colors.surface,
        child: SafeArea(
          top: false,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              if (widget.uploading) const LinearProgressIndicator(minHeight: 2),
              if (query != null && candidates.isNotEmpty)
                GroupMentionPicker(
                  members: candidates,
                  t: t,
                  onPick: _pick,
                ),
              if (editing != null)
                bar(
                  icon: AppIcons.editOutlined,
                  title: t.t('group.conv.editing'),
                  text: editing.body,
                  onClose: widget.onCancelEdit,
                )
              else if (reply != null)
                bar(
                  icon: AppIcons.replyRounded,
                  title: t.t(
                    'group.conv.replyTo',
                    {
                      'name': reply.mine
                          ? t.t('group.you')
                          : groupPersonName(t, reply.sender),
                    },
                  ),
                  text: groupMessagePreview(t, reply),
                  onClose: widget.onCancelReply,
                ),
              Padding(
                padding: EdgeInsets.fromLTRB(
                  editing == null ? AppSpacing.xs : AppSpacing.sm,
                  AppSpacing.sm,
                  AppSpacing.sm,
                  AppSpacing.sm,
                ),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    if (editing == null && widget.canAttach)
                      AppIconButton(
                        icon: AppIcon(
                          AppIcons.addRounded,
                          color: colors.iconTint,
                        ),
                        semanticLabel: t.t('chat.attach.button'),
                        onPressed: widget.onAttach,
                      ),
                    Expanded(child: field),
                    const SizedBox(width: AppSpacing.xs),
                    ValueListenableBuilder<TextEditingValue>(
                      valueListenable: _text,
                      builder: (context, v, _) {
                        final on = v.text.trim().isNotEmpty;
                        return Semantics(
                          button: true,
                          enabled: on,
                          label: editing != null
                              ? t.t('group.conv.saveEdit')
                              : t.t('chat.send'),
                          excludeSemantics: true,
                          child: AppPressable(
                            onTap: on ? _submit : null,
                            child: Container(
                              width: AppSizes.touchTarget + 4,
                              height: AppSizes.touchTarget + 4,
                              decoration: BoxDecoration(
                                shape: BoxShape.circle,
                                color: on ? colors.gold : colors.border,
                              ),
                              child: AppIcon(
                                editing != null
                                    ? AppIcons.checkRounded
                                    : AppIcons.arrowUpwardRounded,
                                color: on ? colors.navy : colors.textSecondary,
                              ),
                            ),
                          ),
                        );
                      },
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
