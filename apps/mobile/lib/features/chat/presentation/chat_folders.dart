import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
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
          // Owner 2026-10-21: how many case chats wait for my answer.
          ChatListFolder.cases => counts?.cases,
          _ => null,
        };
    // Owner 2026-10-22 (Instagram DM tabs): the pills share the whole row in
    // equal widths with small gaps; the label shrinks to fit a long language.
    // «Requests» ends with a chevron.
    // "General" tab is hidden: it meant the same as "All".
    // Owner 2026-10-19: «Основные» (primary) is hidden too; its
    // filter stays in the code.
    final shown = [
      for (final f in ChatListFolder.values)
        if (f != ChatListFolder.general &&
            f != ChatListFolder.primary &&
            f != ChatListFolder.archive)
          f,
    ];
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
                  t.t('chat.folder.${f.name}'),
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
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => _OrganizeSheet(conversation: c, inArchive: inArchive),
    );

class _OrganizeSheet extends ConsumerStatefulWidget {
  const _OrganizeSheet({required this.conversation, required this.inArchive});

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
  }) async {
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
      final messenger = ScaffoldMessenger.maybeOf(context);
      Navigator.of(context).pop();
      if (done != null && messenger != null && messenger.mounted) {
        showAppSnackBar(messenger.context, t.t(done));
      }
    } on Object {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = widget.conversation;
    final repo = ref.read(chatRepositoryProvider);
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
            // Owner 2026-10-20: the long-press menu has the usual quick
            // actions — mute, mark read, delete.
            AppListRow(
              key: const ValueKey('organize-mute'),
              icon: AppIcons.notificationsOffOutlined,
              label: t.t(c.muted ? 'chat.unmute' : 'chat.mute'),
              onTap: _busy
                  ? null
                  : () => _run(
                        () => repo.mute(
                          c.id,
                          c.muted
                              ? null
                              : DateTime.now().add(const Duration(days: 3650)),
                        ),
                        done: c.muted
                            ? 'chat.select.unmuted'
                            : 'chat.select.muted',
                      ),
            ),
            if (c.unreadCount > 0 && c.lastMessage != null)
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
                        () => repo.organize(c.id, archived: !widget.inArchive),
                        done: widget.inArchive
                            ? 'chat.unarchive'
                            : 'tasks.bulk.archive',
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
                        () => repo.organize(c.id, hidden: true),
                        done: 'chat.select.deleted',
                      );
                    },
            ),
            // Owner 2026-10-21: no «Primary» any more; the chat moves to the
            // folders that exist. «Cases» holds the case chats by itself.
            if (!c.waiting)
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
        ),
      ),
    );
  }
}
