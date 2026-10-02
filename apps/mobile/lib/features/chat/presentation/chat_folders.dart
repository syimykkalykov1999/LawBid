import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';

/// Owner 2026-10-01: small Instagram-like sub-tabs inside Chats —
/// All · Primary · General · Waiting · Requests (with counts).
class ChatFolderPills extends ConsumerWidget {
  const ChatFolderPills({
    required this.value,
    required this.onChanged,
    super.key,
  });

  final ChatListFolder value;
  final ValueChanged<ChatListFolder> onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final counts = ref.watch(chatFolderCountsProvider).value;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    int? countOf(ChatListFolder f) => switch (f) {
          ChatListFolder.waiting => counts?.waiting,
          ChatListFolder.requests => counts?.requests,
          _ => null,
        };
    return SizedBox(
      height: 36,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
        children: [
          for (final f in ChatListFolder.values) ...[
            Semantics(
              selected: f == value,
              button: true,
              child: GestureDetector(
                key: ValueKey('chat-folder-${f.name}'),
                onTap: () {
                  HapticFeedback.selectionClick();
                  onChanged(f);
                },
                child: AnimatedContainer(
                  duration: dur,
                  padding:
                      const EdgeInsets.symmetric(horizontal: AppSpacing.md),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: f == value ? colors.navy : colors.surface,
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                    border: Border.all(
                      color: f == value ? colors.gold : colors.border,
                    ),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        t.t('chat.folder.${f.name}'),
                        style: type.bodySmall.copyWith(
                          color: f == value ? AppColorsDark.text : colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if ((countOf(f) ?? 0) > 0) ...[
                        const SizedBox(width: 6),
                        Container(
                          padding: const EdgeInsets.symmetric(
                            horizontal: 6,
                            vertical: 1,
                          ),
                          decoration: BoxDecoration(
                            color: colors.gold,
                            borderRadius: BorderRadius.circular(AppRadii.pill),
                          ),
                          child: Text(
                            '${countOf(f)}',
                            style: type.caption.copyWith(
                              color: AppColorsLight.navy,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
          ],
        ],
      ),
    );
  }
}

/// Owner 2026-10-01: the chat's own menu (the button at its top right) —
/// pin to the top, move to Primary / General, "waiting for my answer"
/// with a note that shows right in the list ("send him the documents").
Future<void> showChatOrganizeSheet(
  BuildContext context,
  WidgetRef ref,
  Conversation c,
) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _OrganizeSheet(conversation: c),
    );

class _OrganizeSheet extends ConsumerStatefulWidget {
  const _OrganizeSheet({required this.conversation});

  final Conversation conversation;

  @override
  ConsumerState<_OrganizeSheet> createState() => _OrganizeSheetState();
}

class _OrganizeSheetState extends ConsumerState<_OrganizeSheet> {
  late final _note = TextEditingController(text: widget.conversation.note);
  late bool _waiting = widget.conversation.waiting;
  bool _busy = false;

  @override
  void dispose() {
    _note.dispose();
    super.dispose();
  }

  Future<void> _run(
    Future<Conversation> Function() call, {
    String? done,
  }) async {
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await call();
      refreshChatFolders(ref);
      if (!mounted) return;
      final messenger = ScaffoldMessenger.maybeOf(context);
      Navigator.of(context).pop();
      if (done != null && messenger != null && messenger.mounted) {
        showAppSnackBar(messenger.context, t.t(done));
      }
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = widget.conversation;
    final repo = ref.read(chatRepositoryProvider);
    final other = c.folder == ChatFolder.primary
        ? ChatFolder.general
        : ChatFolder.primary;
    return Padding(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        0,
        AppSpacing.screenSide,
        MediaQuery.viewInsetsOf(context).bottom + AppSpacing.lg,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const SizedBox(height: AppSpacing.sm),
            const AppSheetHandle(),
            AppListRow(
              key: const ValueKey('organize-pin'),
              icon: c.pinned ? AppIcons.pushPin : AppIcons.pushPinOutlined,
              label:
                  t.t(c.pinned ? 'chat.organize.unpin' : 'chat.organize.pin'),
              onTap: _busy
                  ? null
                  : () => _run(
                        () => repo.organize(c.id, pinned: !c.pinned),
                        done: c.pinned
                            ? 'chat.organize.unpinned'
                            : 'chat.organize.pinned',
                      ),
            ),
            AppListRow(
              key: const ValueKey('organize-move'),
              icon: other == ChatFolder.primary
                  ? AppIcons.starOutlineRounded
                  : AppIcons.inboxOutlined,
              label: t.t('chat.organize.moveTo', {
                'folder': t.t('chat.folder.${other.name}'),
              }),
              subtitle: c.folderAuto ? t.t('chat.organize.autoHint') : null,
              onTap: _busy
                  ? null
                  : () => _run(
                        () => repo.organize(c.id, folder: other),
                        done: 'chat.organize.moved',
                      ),
            ),
            if (!c.folderAuto)
              AppListRow(
                key: const ValueKey('organize-auto'),
                icon: AppIcons.autoModeRounded,
                label: t.t('chat.organize.auto'),
                onTap: _busy
                    ? null
                    : () => _run(
                          () => repo.organize(c.id, resetFolder: true),
                          done: 'chat.organize.moved',
                        ),
              ),
            const SizedBox(height: AppSpacing.md),
            // A Material of its own: the switch row's ink stays visible on
            // the gold tint.
            Material(
              color: colors.goldTint,
              borderRadius: BorderRadius.circular(AppRadii.card),
              child: Padding(
                padding: const EdgeInsets.all(AppSpacing.md),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    SwitchListTile.adaptive(
                      key: const ValueKey('organize-waiting'),
                      contentPadding: EdgeInsets.zero,
                      value: _waiting,
                      activeTrackColor: colors.gold,
                      title: Text(
                        t.t('chat.organize.waiting'),
                        style: type.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                      subtitle: Text(
                        t.t('chat.organize.waitingHint'),
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                      onChanged: (v) => setState(() => _waiting = v),
                    ),
                    AppTextField(
                      key: const ValueKey('organize-note'),
                      controller: _note,
                      hintText: t.t('chat.organize.noteHint'),
                      semanticLabel: t.t('chat.organize.noteHint'),
                      maxLength: 280,
                      maxLines: 3,
                      leading: AppIcon(
                        AppIcons.stickyNote2Outlined,
                        color: colors.goldDark,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppButton(
                      key: const ValueKey('organize-save'),
                      label: t.t('common.save'),
                      icon: AppIcons.checkRounded,
                      isLoading: _busy,
                      onPressed: () => _run(
                        () => repo.organize(
                          c.id,
                          waiting: _waiting,
                          note: _note.text.trim(),
                        ),
                        done: 'chat.organize.saved',
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
