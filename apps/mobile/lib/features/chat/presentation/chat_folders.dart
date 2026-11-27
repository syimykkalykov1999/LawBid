import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/pop_if_current.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/features/chat/application/awaiting_reply.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_undo.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart'
    show unreadGroupsProvider;
import 'package:lawbid/features/groups/application/group_providers.dart'
    show groupsEnabledProvider;
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart'
    show muteDuration, pickMute;
import 'package:material_ui/material_ui.dart';

/// The pills of Chats, in order. "General" is hidden: it meant the same as
/// "All". Owner 2026-10-19: «Основные» (primary) is hidden too. Owner
/// 2026-11-18: no «Непрочитанные», «Кейсы» is a top tab. Owner 2026-11-25:
/// no «Ожидают ответа» either — it meant the same as «Непрочитанные»; only
/// «Все · Группы · Запросы» stay. The hidden folders and their filters stay
/// in the code. Owner 2026-11-16 (WhatsApp «Группы» filter): «Группы» only
/// while «Группы в чатах» is on.
List<ChatListFolder> chatFolderPills({required bool groupsOn}) => [
      ChatListFolder.all,
      if (groupsOn) ChatListFolder.groups,
      ChatListFolder.requests,
    ];

/// The folder Chats shows for a chosen (or remembered) [folder]: one whose
/// pill is gone — «Ожидают ответа» (owner 2026-11-25), «Непрочитанные»,
/// «Группы» while groups are off — falls back to «Все».
ChatListFolder shownChatFolder(
  ChatListFolder folder, {
  required bool groupsOn,
}) =>
    chatFolderPills(groupsOn: groupsOn).contains(folder)
        ? folder
        : ChatListFolder.all;

/// Owner 2026-10-01: small Instagram-like sub-tabs inside Chats —
/// All · Groups · Waiting · Requests (with counts). Owner 2026-11-18:
/// «Непрочитанные» is gone (each row shows its unread) and «Кейсы» is a
/// top tab of its own now. Owner 2026-11-25: «Ожидают ответа» is gone too
/// — the pills are «Все · Группы · Запросы» ([chatFolderPills]).
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
    final groupsOn = ref.watch(groupsEnabledProvider);
    final unreadGroups = groupsOn ? ref.watch(unreadGroupsProvider) : 0;
    final dur = context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    int? countOf(ChatListFolder f) => switch (f) {
          ChatListFolder.waiting => counts?.waiting,
          ChatListFolder.requests => counts?.requests,
          // Owner 2026-10-21: how many case chats wait for my answer.
          ChatListFolder.cases => counts?.cases,
          // Owner 2026-11-16 (Telegram folder badge): groups with unread.
          ChatListFolder.groups => unreadGroups,
          _ => null,
        };
    // Owner 2026-10-22 (Instagram DM tabs): the pills share the whole row in
    // equal widths with small gaps; the label shrinks to fit a long language.
    // «Requests» ends with a chevron.
    final shown = chatFolderPills(groupsOn: groupsOn);
    return SizedBox(
      height: 32,
      child: Padding(
        padding: const EdgeInsetsDirectional.only(start: AppSpacing.sm),
        child: Row(
          children: [
            for (var i = 0; i < shown.length; i++) ...[
              if (i > 0) const SizedBox(width: AppSpacing.xs),
              Expanded(
                child: _pill(
                  context,
                  shown[i],
                  t: t,
                  colors: colors,
                  type: type,
                  dur: dur,
                  count: countOf(shown[i]) ?? 0,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  Widget _pill(
    BuildContext context,
    ChatListFolder f, {
    required Translator t,
    required AppColorTokens colors,
    required AppTypographyTokens type,
    required Duration dur,
    required int count,
  }) {
    final selected = f == value;
    final fg = selected ? AppColorsDark.text : colors.text;
    return Semantics(
      selected: selected,
      button: true,
      child: GestureDetector(
        key: ValueKey('chat-folder-${f.name}'),
        behavior: HitTestBehavior.opaque,
        onTap: () {
          AppHaptics.selection();
          onChanged(f);
        },
        child: AnimatedContainer(
          duration: dur,
          padding: const EdgeInsets.symmetric(horizontal: 6),
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: selected ? colors.navy : colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.pill),
            border: Border.all(color: selected ? colors.gold : colors.border),
          ),
          child: FittedBox(
            fit: BoxFit.scaleDown,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  // «Группы»: the existing string, already in 85 languages.
                  t.t(
                    f == ChatListFolder.groups
                        ? 'chat.forward.groups'
                        : 'chat.folder.${f.name}',
                  ),
                  maxLines: 1,
                  style: type.bodySmall.copyWith(
                    color: fg,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                if (count > 0) ...[
                  const SizedBox(width: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 5,
                      vertical: 1,
                    ),
                    decoration: BoxDecoration(
                      color: colors.gold,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                    child: Text(
                      context.digits(count),
                      style: type.caption.copyWith(
                        color: AppColorsLight.navy,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                ],
                if (f == ChatListFolder.requests)
                  AppIcon(AppIcons.chevronRightRounded, size: 16, color: fg),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-01: the chat's own menu (the button at its top right) —
/// pin to the top, move to «Waiting», "waiting for my answer"
/// with a note that shows right in the list ("send him the documents").
Future<void> showChatOrganizeSheet(
  BuildContext context,
  WidgetRef ref,
  Conversation c, {
  bool inArchive = false,
  String? noReplyMessageId,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _OrganizeSheet(
        conversation: c,
        inArchive: inArchive,
        noReplyMessageId: noReplyMessageId,
      ),
    );

/// Row 95: the quick actions of a chat on its long-press preview — the
/// rows of [showChatOrganizeSheet] (same keys), the note and «waiting»
/// one tap further («organize-more» opens the full sheet).
class ChatOrganizeActions extends StatelessWidget {
  const ChatOrganizeActions({
    required this.conversation,
    this.inArchive = false,
    this.noReplyMessageId,
    super.key,
  });

  final Conversation conversation;
  final bool inArchive;
  final String? noReplyMessageId;

  @override
  Widget build(BuildContext context) => _OrganizeSheet(
        conversation: conversation,
        inArchive: inArchive,
        noReplyMessageId: noReplyMessageId,
        compact: true,
      );
}

class _OrganizeSheet extends ConsumerStatefulWidget {
  const _OrganizeSheet({
    required this.conversation,
    required this.inArchive,
    this.noReplyMessageId,
    this.compact = false,
  });

  /// Row 95: only the action rows, for the long-press preview menu.
  final bool compact;

  /// Owner 2026-11-04 (N-03): the last message of a chat that shows
  /// «Awaiting reply»; the sheet then offers «No reply needed» for it.
  final String? noReplyMessageId;

  final Conversation conversation;

  /// Opened from the Archive screen: «Unarchive» instead of «Archive».
  final bool inArchive;

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
    bool? undoArchived,
    bool atOnce = false,
  }) async {
    if (atOnce) return _runAtOnce(call, done: done, undoArchived: undoArchived);
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await call();
    } on Object catch (e) {
      if (mounted) {
        setState(() => _busy = false);
        showAppSnackBar(context, errorText(t, e));
      }
      return;
    }
    // The write is done: a failing re-read must not look like a failed one.
    try {
      refreshChatFolders(ref);
      if (!mounted) return;
      // Row 109: the «Undo» message is shown from the navigator, which
      // outlives this sheet and the chat row. Owner 26.11: the plain «done»
      // message too (the messenger's own context has no messenger above it,
      // so it was never seen).
      final host = Navigator.of(context).context;
      context.popIfCurrent();
      // Row 109 (Telegram / Gmail): a delete or an archive offers «Undo».
      if (done != null && undoArchived != null && host.mounted) {
        showChatMoveUndo(
          host,
          message: t.t(undoArchived ? 'chat.archived' : done),
          chatIds: [widget.conversation.id],
          archived: undoArchived,
        );
      } else if (done != null && host.mounted) {
        showAppSnackBar(host, t.t(done));
      }
    } on Object {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Owner 26.11 (Telegram, WhatsApp): pin, mute, unread, archive and delete
  /// close the menu at once — the list behind it already changed
  /// ([ChatListsHub]); the request runs on. A refusal puts the list back
  /// (the hub) and the error shows on the screen under the menu; the
  /// answer brings the usual message or «Undo».
  Future<void> _runAtOnce(
    Future<Conversation> Function() call, {
    String? done,
    bool? undoArchived,
  }) async {
    final t = ref.read(translatorProvider);
    final container = ProviderScope.containerOf(context, listen: false);
    // The screen under this menu outlives it and the chat row.
    final host = Navigator.of(context).context;
    // Starts the request; the hub has changed the lists before this returns.
    final pending = call();
    setState(() => _busy = true);
    context.popIfCurrent();
    try {
      await pending;
    } on Object catch (e) {
      if (host.mounted) showAppSnackBar(host, errorText(t, e));
      return;
    }
    try {
      refreshChatFoldersIn(container);
    } on Object {
      // The app is closing: the next open reads the lists.
    }
    if (!host.mounted || done == null) return;
    if (undoArchived != null) {
      showChatMoveUndo(
        host,
        message: t.t(undoArchived ? 'chat.archived' : done),
        chatIds: [widget.conversation.id],
        archived: undoArchived,
      );
    } else {
      showAppSnackBar(host, t.t(done));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = widget.conversation;
    final repo = ref.read(chatRepositoryProvider);
    // Owner 26.11 (Telegram, WhatsApp): the list behind this menu changes at
    // once; a refusal puts it back (ChatListsHub).
    final lists = ref.read(chatListsHubProvider);
    final compact = widget.compact;
    return Padding(
      padding: compact
          ? EdgeInsets.zero
          : EdgeInsets.fromLTRB(
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
            if (!compact) ...[
              const SizedBox(height: AppSpacing.sm),
              const AppSheetHandle(),
            ],
            AppListRow(
              key: const ValueKey('organize-pin'),
              icon: c.pinned ? AppIcons.pushPin : AppIcons.pushPinOutlined,
              label:
                  t.t(c.pinned ? 'chat.organize.unpin' : 'chat.organize.pin'),
              onTap: _busy
                  ? null
                  : () => _run(
                        () => lists.run(
                          c.id,
                          change: (x) => x.withMine(pinned: !c.pinned),
                          call: () => repo.organize(c.id, pinned: !c.pinned),
                        ),
                        done: c.pinned
                            ? 'chat.organize.unpinned'
                            : 'chat.organize.pinned',
                        atOnce: true,
                      ),
            ),
            if (widget.noReplyMessageId != null)
              AppListRow(
                key: const ValueKey('organize-no-reply'),
                icon: AppIcons.doneAllRounded,
                label: t.t('chat.noReply'),
                onTap: _busy
                    ? null
                    : () async {
                        await ref
                            .read(awaitingReplyDismissedProvider.notifier)
                            .dismiss(c.id, widget.noReplyMessageId!);
                        if (!context.mounted) return;
                        context.popIfCurrent();
                      },
              ),
            // Owner 2026-10-20: the long-press menu has the usual quick
            // actions — mute, mark read, delete.
            AppListRow(
              key: const ValueKey('organize-mute'),
              icon: AppIcons.notificationsOffOutlined,
              label: t.t(c.muted ? 'chat.unmute' : 'chat.mute'),
              // Row 110: how long, the same choice as in the chat's info.
              onTap: _busy
                  ? null
                  : () async {
                      Duration? span;
                      if (!c.muted) {
                        final pick = await pickMute(context, t, muted: false);
                        if (pick == null || !mounted) return;
                        span = muteDuration(pick);
                      }
                      final until =
                          span == null ? null : DateTime.now().add(span);
                      await _run(
                        () => lists.run(
                          c.id,
                          change: (x) => x.withMine(
                            mutedUntil: until,
                            unmute: until == null,
                          ),
                          call: () => repo.mute(c.id, until),
                        ),
                        done: span == null
                            ? 'chat.select.unmuted'
                            : 'chat.select.muted',
                        atOnce: true,
                      );
                    },
            ),
            if (c.hasUnread && c.lastMessage != null)
              AppListRow(
                key: const ValueKey('organize-read'),
                icon: AppIcons.doneAllRounded,
                label: t.t('notif.markAllRead'),
                onTap: _busy
                    ? null
                    : () => _run(() async {
                          await repo.read(c.id, c.lastMessage!.id);
                          return c;
                        }),
              )
            // Row 110 (Telegram, WhatsApp «Mark as unread»): a read chat
            // gets the unread mark back; opening it takes the mark off.
            else if (c.lastMessage != null)
              AppListRow(
                key: const ValueKey('organize-unread'),
                icon: AppIcons.markEmailUnreadOutlined,
                label: t.t('chat.markUnread'),
                onTap: _busy
                    ? null
                    : () => _run(
                          () => lists.run(
                            c.id,
                            change: (x) => x.withActivity(markedUnread: true),
                            call: () => repo.organize(c.id, unread: true),
                          ),
                          atOnce: true,
                        ),
              ),
            AppListRow(
              key: const ValueKey('organize-archive'),
              icon: widget.inArchive
                  ? AppIcons.unarchiveOutlined
                  : AppIcons.inventory2Outlined,
              label: t.t(
                widget.inArchive ? 'chat.unarchive' : 'tasks.bulk.archive',
              ),
              onTap: _busy
                  ? null
                  : () => _run(
                        () => lists.run(
                          c.id,
                          leaves: true,
                          call: () =>
                              repo.organize(c.id, archived: !widget.inArchive),
                        ),
                        done: widget.inArchive
                            ? 'chat.unarchive'
                            : 'tasks.bulk.archive',
                        undoArchived: widget.inArchive ? null : true,
                        atOnce: true,
                      ),
            ),
            AppListRow(
              key: const ValueKey('organize-delete'),
              icon: AppIcons.deleteOutlineRounded,
              label: t.t('chat.select.delete'),
              onTap: _busy
                  ? null
                  : () async {
                      final ok = await showConfirmSheet(
                        context,
                        t: t,
                        title: t.t('chat.select.deleteTitle', {'count': '1'}),
                        message: t.t('chat.select.deleteMessage'),
                        confirmLabel: t.t('chat.select.delete'),
                        destructive: true,
                      );
                      if (!ok || !mounted) return;
                      await _run(
                        () => lists.run(
                          c.id,
                          leaves: true,
                          call: () => repo.organize(c.id, hidden: true),
                        ),
                        done: 'chat.select.deleted',
                        undoArchived: false,
                        atOnce: true,
                      );
                    },
            ),
            // Owner 2026-10-21: no «Primary» any more; the chat moves to the
            // folders that exist. «Cases» holds the case chats by itself.
            // Owner 2026-11-25: no «Ожидают ответа» chip any more, so no
            // «Move to: Ожидают ответа» either while the chip is gone (the
            // row stays in the code; «Жду ответа» and the note stay in the
            // full sheet below).
            if (!c.waiting &&
                chatFolderPills(groupsOn: true)
                    .contains(ChatListFolder.waiting))
              AppListRow(
                key: const ValueKey('organize-move'),
                icon: AppIcons.hourglassEmptyRounded,
                label: t.t('chat.organize.moveTo', {
                  'folder': t.t('chat.folder.waiting'),
                }),
                onTap: _busy
                    ? null
                    : () => _run(
                          () => repo.organize(c.id, waiting: true),
                          done: 'chat.organize.moved',
                        ),
              ),
            if (compact)
              AppListRow(
                key: const ValueKey('organize-more'),
                icon: AppIcons.stickyNote2Outlined,
                label: t.t('chat.organize.title'),
                onTap: _busy
                    ? null
                    : () {
                        final nav = Navigator.of(context);
                        final host = nav.context;
                        nav.pop();
                        unawaited(
                          showChatOrganizeSheet(
                            host,
                            ref,
                            c,
                            inArchive: widget.inArchive,
                            noReplyMessageId: widget.noReplyMessageId,
                          ),
                        );
                      },
              ),
            if (!compact) ...[
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
                          style: type.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                        onChanged: (v) => setState(() => _waiting = v),
                      ),
                      AppTextField(
                        key: const ValueKey('organize-note'),
                        controller: _note,
                        hintText: t.t('chat.organize.noteHint'),
                        semanticLabel: t.t('chat.organize.noteHint'),
                        maxLength: 280,
                        // Owner 2026-10-19: the field grows with the text
                        // (about 220 characters on screen), then scrolls.
                        maxLines: 8,
                        keyboardType: TextInputType.multiline,
                        leading: AppIcon(
                          AppIcons.stickyNote2Outlined,
                          color: colors.iconTint,
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
          ],
        ),
      ),
    );
  }
}
