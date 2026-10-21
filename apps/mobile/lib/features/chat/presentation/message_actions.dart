import 'dart:async';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_saved_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_message_menu.dart';
import 'package:lawbid/features/chat/presentation/chat_translation.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart'
    show kContactMask;
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/stars/application/stars_providers.dart';
import 'package:lawbid/features/stars/domain/stars_models.dart';
import 'package:lawbid/features/stars/presentation/low_stars_sheet.dart';

/// Owner 2026-10-20 (WhatsApp / Telegram): what you can do with a message —
/// reply, copy, forward, pin, edit (inside the admin's window), select,
/// delete for me / for everyone (inside the admin's window), react.

/// The six quick reactions of the long-press menu (WhatsApp's default row).
const kQuickReactions = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

/// What the composer is doing besides a plain message: quoting [replyTo] or
/// editing [editing] (never both).
@immutable
class ChatCompose {
  const ChatCompose({this.replyTo, this.editing});

  final ChatMessage? replyTo;
  final ChatMessage? editing;
}

class ChatComposeNotifier extends Notifier<ChatCompose> {
  ChatComposeNotifier(this.conversationId);

  final String conversationId;

  @override
  ChatCompose build() => const ChatCompose();

  void reply(ChatMessage m) => state = ChatCompose(replyTo: m);
  void edit(ChatMessage m) => state = ChatCompose(editing: m);
  void clear() => state = const ChatCompose();
}

final chatComposeProvider = NotifierProvider.autoDispose
    .family<ChatComposeNotifier, ChatCompose, String>(ChatComposeNotifier.new);

/// The ids picked in "Select" mode; empty means the mode is off.
class ChatSelectionNotifier extends Notifier<Set<String>> {
  ChatSelectionNotifier(this.conversationId);

  final String conversationId;

  @override
  Set<String> build() => const {};

  void toggle(String id) {
    final next = {...state};
    if (!next.remove(id)) next.add(id);
    state = next;
  }

  void start(String id) => state = {id};
  void clear() => state = const {};
}

final chatMsgSelectionProvider = NotifierProvider.autoDispose
    .family<ChatSelectionNotifier, Set<String>, String>(
  ChatSelectionNotifier.new,
);

/// The text a quote / pin / banner shows for [kind] with no own text.
String kindLabel(Translator t, MessageKind kind) => switch (kind) {
      MessageKind.voice => t.t('chat.voice.label'),
      MessageKind.sticker => t.t('stickers.label'),
      MessageKind.attachment => t.t('chat.attach.label'),
      MessageKind.call => t.t('call.button'),
      MessageKind.post => t.t('chat.post.label'),
      _ => '',
    };

String plainBody(Translator t, ChatMessage m) =>
    m.body.replaceAll(kContactMask, t.t('chat.masked'));

String previewText(Translator t, ChatMessage m) {
  if (m.revoked) return t.t('chat.deleted');
  if (m.kind == MessageKind.text) return plainBody(t, m);
  final label = kindLabel(t, m.kind);
  return m.kind == MessageKind.attachment && m.body.trim().isNotEmpty
      ? '$label · ${plainBody(t, m)}'
      : label;
}

String _errorOf(Translator t, Object e) {
  if (e is ApiException) {
    if (e.code == 'MESSAGE_WINDOW_EXPIRED') {
      return t.t('chat.err.windowExpired');
    }
    if (e.code == 'MESSAGE_PIN_LIMIT') return t.t('chat.err.pinLimit');
  }
  return errorText(t, e);
}

/// Everything a person wrote or sent can be passed on: the server copies a
/// voice note's or file's reference, so nothing is uploaded again.
bool canForward(ChatMessage m) =>
    !m.isLocal &&
    !m.revoked &&
    (m.kind == MessageKind.text ||
        m.kind == MessageKind.sticker ||
        m.kind == MessageKind.voice ||
        m.kind == MessageKind.attachment);

/// Sends [messages] (oldest first) to every chat in [targets]; returns how
/// many of them could not be passed on.
Future<int> forwardMessages(
  WidgetRef ref,
  List<ChatMessage> messages,
  List<String> targets,
) async {
  final owner = ref.read(currentUserIdProvider);
  if (owner == null) return messages.length;
  final db = ref.read(socialLocalDatabaseProvider);
  final repo = ref.read(chatRepositoryProvider);
  var skipped = 0;
  final ordered = [...messages]
    ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  for (final target in targets) {
    for (final m in ordered) {
      if (!canForward(m)) {
        skipped++;
        continue;
      }
      if (m.kind != MessageKind.text) {
        try {
          await repo.forward(target, newClientMessageId(), m.id);
        } on Object {
          skipped++;
        }
        continue;
      }
      await db.enqueue(
        clientMessageId: newClientMessageId(),
        ownerId: owner,
        conversationId: target,
        body: m.body,
        forwarded: true,
      );
    }
  }
  unawaited(ref.read(outboxSenderProvider).drain());
  return skipped ~/ (targets.isEmpty ? 1 : targets.length);
}

Future<void> copyMessages(
  BuildContext context,
  WidgetRef ref,
  List<ChatMessage> messages,
) async {
  final t = ref.read(translatorProvider);
  final ordered = [...messages]
    ..sort((a, b) => a.createdAt.compareTo(b.createdAt));
  final text = [
    for (final m in ordered)
      if (!m.revoked && m.kind == MessageKind.text) plainBody(t, m),
  ].join('\n');
  if (text.isEmpty) return;
  await Clipboard.setData(ClipboardData(text: text));
  if (context.mounted) showAppSnackBar(context, t.t('chat.copied'));
}

/// "Delete for me" / "Delete for everyone" (only when every message is mine
/// and inside the window) / Cancel. Returns whether anything was deleted.
Future<bool> confirmDelete(
  BuildContext context,
  WidgetRef ref,
  String conversationId,
  List<ChatMessage> messages,
) async {
  final t = ref.read(translatorProvider);
  final thread = ref.read(chatThreadProvider(conversationId).notifier);
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final type = Theme.of(context).extension<AppTypographyTokens>()!;
  final all = messages.every(thread.canDeleteForAll);
  final choice = await showAppBottomSheet<String>(
    context: context,
    builder: (sheet) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const AppSheetHandle(),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              0,
              AppSpacing.screenSide,
              AppSpacing.sm,
            ),
            child: Text(
              t.t('chat.act.deleteTitle'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
          ),
          if (all)
            AppListRow(
              key: const ValueKey('delete-all'),
              icon: AppIcons.deleteOutlineRounded,
              label: t.t('chat.act.deleteAll'),
              destructive: true,
              showChevron: false,
              onTap: () => Navigator.of(sheet).pop('all'),
            ),
          AppListRow(
            key: const ValueKey('delete-me'),
            icon: AppIcons.deleteOutlineRounded,
            label: t.t('chat.act.deleteMe'),
            destructive: true,
            showChevron: false,
            onTap: () => Navigator.of(sheet).pop('me'),
          ),
          AppListRow(
            icon: AppIcons.closeRounded,
            label: t.t('common.cancel'),
            showChevron: false,
            onTap: () => Navigator.of(sheet).pop(),
          ),
          const SizedBox(height: AppSpacing.md),
        ],
      ),
    ),
  );
  if (choice == null) return false;
  var failed = false;
  for (final m in messages) {
    try {
      if (m.isLocal) {
        await thread.discard(m);
      } else {
        await thread.delete(m, all: choice == 'all');
      }
    } on Object catch (e) {
      failed = true;
      if (context.mounted) showAppSnackBar(context, _errorOf(t, e));
      break;
    }
  }
  return !failed;
}

bool _sameDay(DateTime a, DateTime b) {
  final x = a.toLocal();
  final y = b.toLocal();
  return x.year == y.year && x.month == y.month && x.day == y.day;
}

/// When the other side read my message [m]: the time they last read the
/// chat, for every message up to the one they stopped at (WhatsApp's "Read
/// at"). null = not read yet.
DateTime? _readAt(WidgetRef ref, String conversationId, ChatMessage m) {
  final c = ref.read(chatThreadProvider(conversationId)).conversation;
  final at = c?.counterpartLastReadAt;
  final last = c?.counterpartLastReadId;
  if (c == null || at == null || last == null) return null;
  if (m.id == last) return at;
  final stop = ref
      .read(chatThreadProvider(conversationId))
      .messages
      .where((x) => x.id == last)
      .firstOrNull;
  final upTo = stop?.createdAt ?? at;
  return m.createdAt.isAfter(upTo) ? null : at;
}

/// The long-press sheet: quick reactions, then the actions that apply.
Future<void> showMessageMenu(
  BuildContext context,
  WidgetRef ref,
  String conversationId,
  ChatMessage m,
) async {
  final t = ref.read(translatorProvider);
  final thread = ref.read(chatThreadProvider(conversationId).notifier);
  final colors = Theme.of(context).extension<AppColorTokens>()!;
  final compose = ref.read(chatComposeProvider(conversationId).notifier);
  final selection = ref.read(chatMsgSelectionProvider(conversationId).notifier);
  final mine = m.senderId == ref.read(currentUserIdProvider);
  final live = !m.isLocal && !m.revoked;
  final text = m.kind == MessageKind.text && !m.revoked;
  final readAt = mine && live ? _readAt(ref, conversationId, m) : null;
  final f = ref.read(l10nFormatsProvider);
  final saved = ref.read(savedChatIdsProvider).value?.contains(m.id) ?? false;
  final myEmoji = m.reactions.where((r) => r.mine).firstOrNull?.emoji;
  // Premium emojis cost stars (admin «Звёзды»); the row is hidden when the
  // flag is off or the list could not be read in time.
  final premium = live && ref.read(starsEnabledProvider)
      ? await _premiumReactions(ref)
      : null;
  if (!context.mounted) return;
  unawaited(HapticFeedback.mediumImpact());

  Future<void> guarded(Future<void> Function() run, {int? price}) async {
    try {
      await run();
    } on Object catch (e) {
      if (!context.mounted) return;
      if (price != null &&
          e is ApiException &&
          e.code == ApiErrorCodes.insufficientStars) {
        await showLowStarsSheet(context, t, price: price);
        return;
      }
      showAppSnackBar(context, _errorOf(t, e));
    }
  }

  await showAppBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (sheet) {
      void close() => Navigator.of(sheet).pop();
      Widget row(
        String key,
        IconData icon,
        String label,
        VoidCallback onTap, {
        bool destructive = false,
      }) =>
          AppListRow(
            key: ValueKey('msg-act-$key'),
            icon: icon,
            label: label,
            destructive: destructive,
            showChevron: false,
            onTap: () {
              close();
              onTap();
            },
          );
      return SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              if (live)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.sm,
                  ),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      for (final e in kQuickReactions)
                        _ReactionButton(
                          emoji: e,
                          selected: e == myEmoji,
                          onTap: () {
                            close();
                            unawaited(
                              guarded(
                                () => thread.react(m, e == myEmoji ? null : e),
                              ),
                            );
                          },
                        ),
                    ],
                  ),
                ),
              if (live &&
                  premium != null &&
                  premium.premiumReactions.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                  ),
                  // Even rows (7 at most), the same column width in each, so
                  // a last emoji never hangs alone on its own line.
                  child: Column(
                    key: const ValueKey('msg-premium-reactions'),
                    children: [
                      for (final row in _evenRows(premium.premiumReactions, 7))
                        Row(
                          children: [
                            for (final e in row)
                              Expanded(
                                child: Center(
                                  child: _ReactionButton(
                                    emoji: e,
                                    selected: e == myEmoji,
                                    price: premium.reactionStars,
                                    onTap: () {
                                      close();
                                      unawaited(
                                        guarded(
                                          () => thread.react(
                                            m,
                                            e == myEmoji ? null : e,
                                          ),
                                          price: premium.reactionStars,
                                        ),
                                      );
                                    },
                                  ),
                                ),
                              ),
                          ],
                        ),
                    ],
                  ),
                ),
              if (readAt != null)
                Padding(
                  padding: const EdgeInsets.symmetric(
                    horizontal: AppSpacing.md,
                    vertical: AppSpacing.sm,
                  ),
                  child: Row(
                    key: const ValueKey('msg-read-at'),
                    children: [
                      AppIcon(AppIcons.doneAllRounded, color: colors.iconTint),
                      const SizedBox(width: AppSpacing.sm),
                      Text(
                        [
                          t.t('chat.seen'),
                          if (!_sameDay(readAt, DateTime.now()))
                            f.dayMonth(readAt),
                          f.time(readAt),
                        ].join(' · '),
                        style: Theme.of(context)
                            .extension<AppTypographyTokens>()!
                            .body
                            .copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
              if (live)
                row(
                  'reply',
                  AppIcons.replyRounded,
                  t.t('chat.act.reply'),
                  () => compose.reply(m),
                ),
              if (text)
                row(
                  'copy',
                  AppIcons.copyOutlined,
                  t.t('chat.act.copy'),
                  () => unawaited(copyMessages(context, ref, [m])),
                ),
              if (canTranslateChatMessage(ref, m, mine: mine))
                row(
                  'translate',
                  AppIcons.translateRounded,
                  t.t(
                    ref.read(chatTranslationsProvider).containsKey(m.id)
                        ? 'chat.translate.original'
                        : 'chat.translate',
                  ),
                  () => unawaited(
                    toggleChatTranslation(context, ref, conversationId, m),
                  ),
                ),
              if (live && MessageMenuTarget.savable(m))
                row(
                  'save',
                  saved
                      ? AppIcons.bookmarkRounded
                      : AppIcons.bookmarkBorderRounded,
                  t.t(saved ? 'saved.remove' : 'common.save'),
                  () => unawaited(
                    guarded(() async {
                      final notifier = ref.read(savedChatIdsProvider.notifier);
                      await notifier.toggle(m.id);
                      if (context.mounted) {
                        showAppSnackBar(
                          context,
                          t.t(saved ? 'saved.removed' : 'cases.saved.added'),
                        );
                      }
                    }),
                  ),
                ),
              if (canForward(m))
                row(
                  'forward',
                  AppIcons.forwardRounded,
                  t.t('chat.act.forward'),
                  () => unawaited(pickForwardTargets(context, ref, [m])),
                ),
              if (live && m.kind != MessageKind.system)
                row(
                  'pin',
                  AppIcons.pushPinOutlined,
                  t.t(m.pinned ? 'chat.act.unpin' : 'chat.act.pin'),
                  () => unawaited(
                    guarded(() => thread.setPinned(m, pinned: !m.pinned)),
                  ),
                ),
              if (mine && thread.canEdit(m))
                row(
                  'edit',
                  AppIcons.editOutlined,
                  t.t('chat.act.edit'),
                  () => compose.edit(m),
                ),
              row(
                'select',
                AppIcons.selectChecksRounded,
                t.t('chat.act.select'),
                () => selection.start(m.id),
              ),
              row(
                'delete',
                AppIcons.deleteOutlineRounded,
                t.t('chat.act.delete'),
                () => unawaited(
                  confirmDelete(context, ref, conversationId, [m]),
                ),
                destructive: true,
              ),
              SizedBox(
                height: AppSpacing.md,
                child: ColoredBox(color: colors.bg),
              ),
            ],
          ),
        ),
      );
    },
  );
}

/// [items] in the fewest rows of at most [max], filled evenly (8 → 4 + 4).
List<List<T>> _evenRows<T>(List<T> items, int max) {
  if (items.isEmpty) return const [];
  final rows = (items.length + max - 1) ~/ max;
  final per = (items.length + rows - 1) ~/ rows;
  return [
    for (var i = 0; i < items.length; i += per)
      items.sublist(i, i + per > items.length ? items.length : i + per),
  ];
}

/// The premium emojis and their price; `null` when stars are unreachable.
Future<StarsOverview?> _premiumReactions(WidgetRef ref) async {
  // An auto-dispose provider read without a listener can go away while its
  // request is still in flight, so hold it for the wait.
  final hold = ref.container.listen(starsOverviewProvider, (_, __) {});
  try {
    final d = await ref
        .read(starsOverviewProvider.future)
        .timeout(const Duration(milliseconds: 800));
    return d.enabled ? d : null;
  } on Object {
    return null;
  } finally {
    hold.close();
  }
}

class _ReactionButton extends StatelessWidget {
  const _ReactionButton({
    required this.emoji,
    required this.selected,
    required this.onTap,
    this.price,
  });

  final String emoji;
  final bool selected;
  final VoidCallback onTap;

  /// Stars a premium emoji costs, printed small under it.
  final int? price;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      label: price == null ? emoji : '$emoji, $price ⭐',
      excludeSemantics: price != null,
      child: InkResponse(
        onTap: onTap,
        radius: 26,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 46,
              height: 46,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: selected ? colors.goldTint : null,
                border: selected ? Border.all(color: colors.gold) : null,
              ),
              child: Text(
                emoji,
                style: type.titleLarge.copyWith(height: 1),
              ),
            ),
            if (price != null)
              Text(
                '$price ⭐',
                key: ValueKey('react-price-$emoji'),
                maxLines: 1,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
          ],
        ),
      ),
    );
  }
}

/// "Forward to…": the chats as a multi-select list, then Send.
Future<void> pickForwardTargets(
  BuildContext context,
  WidgetRef ref,
  List<ChatMessage> messages,
) async {
  final t = ref.read(translatorProvider);
  final picked = await showAppBottomSheet<List<String>>(
    context: context,
    isScrollControlled: true,
    builder: (_) => const _ForwardSheet(),
  );
  if (picked == null || picked.isEmpty) return;
  final skipped = await forwardMessages(ref, messages, picked);
  if (!context.mounted) return;
  showAppSnackBar(
    context,
    t.t(skipped > 0 ? 'chat.forward.partial' : 'chat.forward.done'),
  );
}

class _ForwardSheet extends ConsumerStatefulWidget {
  const _ForwardSheet();

  @override
  ConsumerState<_ForwardSheet> createState() => _ForwardSheetState();
}

class _ForwardSheetState extends ConsumerState<_ForwardSheet> {
  final _picked = <String>[];

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final list = ref.watch(conversationsProvider);
    final items = list.value?.items ?? const <Conversation>[];
    final height = MediaQuery.sizeOf(context).height * 0.7;
    return SafeArea(
      child: SizedBox(
        height: height,
        child: Column(
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                0,
                AppSpacing.screenSide,
                AppSpacing.sm,
              ),
              child: Align(
                alignment: AlignmentDirectional.centerStart,
                child: Text(
                  t.t('chat.forward.title'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
            ),
            Expanded(
              child: list.isLoading && items.isEmpty
                  ? const Center(child: CircularProgressIndicator())
                  : ListView.builder(
                      itemCount: items.length,
                      itemBuilder: (context, i) {
                        final c = items[i];
                        final on = _picked.contains(c.id);
                        final name = c.counterpart.displayName ??
                            c.counterpart.username ??
                            '?';
                        return ListTile(
                          key: ValueKey('forward-${c.id}'),
                          leading: AppAvatar(
                            initials: avatarInitials(name),
                            imageProvider: c.counterpart.avatarUrl == null
                                ? null
                                : CachedNetworkImageProvider(
                                    c.counterpart.avatarUrl!,
                                    cacheKey: Uri.parse(
                                      c.counterpart.avatarUrl!,
                                    ).path,
                                  ),
                          ),
                          title: Text(
                            name,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.body.copyWith(color: colors.text),
                          ),
                          trailing: AppIcon(
                            on
                                ? AppIcons.checkCircleRounded
                                : AppIcons.radioButtonCheckedRounded,
                            color: on ? colors.iconTint : colors.textSecondary,
                          ),
                          onTap: () => setState(() {
                            on ? _picked.remove(c.id) : _picked.add(c.id);
                          }),
                        );
                      },
                    ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: AppButton(
                label: t.t('chat.forward.send'),
                onPressed: _picked.isEmpty
                    ? null
                    : () => Navigator.of(context).pop(List<String>.of(_picked)),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// The quote block of a reply (inside the bubble) and of the composer bar.
class ReplyQuote extends ConsumerWidget {
  const ReplyQuote({
    required this.preview,
    required this.conversation,
    required this.mine,
    this.onTap,
    this.bar = false,
    this.onClose,
    super.key,
  });

  final ReplyPreview preview;
  final Conversation? conversation;

  /// The bubble holding the quote is mine (picks the tint).
  final bool mine;
  final VoidCallback? onTap;

  /// Shown above the input (with a close button) instead of inside a bubble.
  final bool bar;
  final VoidCallback? onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final me = ref.watch(currentUserIdProvider);
    final who = preview.senderId == me
        ? t.t('chat.you')
        : (conversation?.counterpart.displayName ??
            conversation?.counterpart.username ??
            '');
    final body = preview.revoked
        ? t.t('chat.deleted')
        : (preview.kind == MessageKind.text
            ? preview.snippet.replaceAll(kContactMask, t.t('chat.masked'))
            : kindLabel(t, preview.kind));
    final fg = bar ? colors.text : (mine ? chat.onMine : chat.onTheirs);
    final meta =
        bar ? colors.textSecondary : (mine ? chat.mineMeta : chat.theirsMeta);
    final content = Container(
      decoration: BoxDecoration(
        color: bar
            ? colors.surface
            : (Theme.of(context).brightness == Brightness.dark
                ? Colors.black.withValues(alpha: 0.18)
                : Colors.black.withValues(alpha: 0.06)),
        borderRadius: BorderRadius.circular(bar ? 0 : 10),
      ),
      // The gold edge is its own block: a one-sided border cannot be
      // rounded (it asserted and the whole quote vanished).
      clipBehavior: Clip.antiAlias,
      child: IntrinsicHeight(
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            ColoredBox(
              color: colors.gold,
              child: const SizedBox(width: 3),
            ),
            Expanded(
              child: Padding(
                padding: const EdgeInsetsDirectional.fromSTEB(10, 6, 8, 6),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            bar ? t.t('chat.reply.to', {'name': who}) : who,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption.copyWith(
                              color: colors.gold,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          Text(
                            body,
                            maxLines: bar ? 1 : 2,
                            overflow: TextOverflow.ellipsis,
                            style: type.caption.copyWith(
                              color: preview.revoked ? meta : fg,
                              fontStyle: preview.revoked
                                  ? FontStyle.italic
                                  : FontStyle.normal,
                            ),
                          ),
                        ],
                      ),
                    ),
                    if (onClose != null)
                      AppIconButton(
                        icon: AppIcon(
                          AppIcons.closeRounded,
                          color: colors.textSecondary,
                        ),
                        semanticLabel: t.t('common.cancel'),
                        onPressed: onClose,
                      ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
    return onTap == null
        ? content
        : GestureDetector(
            behavior: HitTestBehavior.opaque,
            onTap: onTap,
            child: content,
          );
  }
}

/// "Edit message" bar above the input while a message is being edited.
class EditBar extends ConsumerWidget {
  const EditBar({required this.message, required this.onClose, super.key});

  final ChatMessage message;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      color: colors.surface,
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.md,
        4,
        4,
        4,
      ),
      child: Row(
        children: [
          AppIcon(AppIcons.editOutlined, color: colors.iconTint, size: 18),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  t.t('chat.edit.title'),
                  style: type.caption.copyWith(
                    color: colors.gold,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                Text(
                  plainBody(t, message),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          AppIconButton(
            icon: AppIcon(AppIcons.closeRounded, color: colors.textSecondary),
            semanticLabel: t.t('common.cancel'),
            onPressed: onClose,
          ),
        ],
      ),
    );
  }
}

/// Emoji chips under a bubble; a tap toggles my own reaction.
class ReactionChips extends ConsumerWidget {
  const ReactionChips({
    required this.message,
    required this.conversationId,
    required this.mine,
    super.key,
  });

  final ChatMessage message;
  final String conversationId;
  final bool mine;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return Padding(
      padding: const EdgeInsets.only(top: 3),
      child: Wrap(
        spacing: 4,
        runSpacing: 4,
        alignment: mine ? WrapAlignment.end : WrapAlignment.start,
        children: [
          for (final r in message.reactions)
            Semantics(
              button: true,
              selected: r.mine,
              label: '${r.emoji} ${r.count}',
              child: GestureDetector(
                onTap: () async {
                  final n =
                      ref.read(chatThreadProvider(conversationId).notifier);
                  try {
                    await n.react(message, r.mine ? null : r.emoji);
                  } on Object catch (e) {
                    if (context.mounted) {
                      showAppSnackBar(context, _errorOf(t, e));
                    }
                  }
                },
                child: Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: r.mine ? colors.goldTint : colors.surface,
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                    border: Border.all(
                      color: r.mine ? colors.gold : colors.border,
                    ),
                  ),
                  child: Text(
                    r.count > 1 ? '${r.emoji} ${r.count}' : r.emoji,
                    style: type.caption.copyWith(color: colors.text),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Pinned messages above the list: the newest pin, "N pinned" when several;
/// a tap opens the list (each row can be unpinned).
class PinnedBanner extends ConsumerWidget {
  const PinnedBanner({
    required this.state,
    required this.conversationId,
    super.key,
  });

  final ChatThreadState state;
  final String conversationId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.pins.isEmpty) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final top = state.pins.first;
    return Material(
      color: colors.surface,
      child: InkWell(
        key: const ValueKey('pinned-banner'),
        onTap: () => _openList(context, ref, f),
        child: Container(
          padding: const EdgeInsetsDirectional.fromSTEB(
            AppSpacing.md,
            6,
            AppSpacing.md,
            6,
          ),
          decoration: BoxDecoration(
            border: Border(bottom: BorderSide(color: colors.border)),
          ),
          child: Row(
            children: [
              Container(width: 3, height: 30, color: colors.gold),
              const SizedBox(width: AppSpacing.sm),
              AppIcon(AppIcons.pushPin, size: 16, color: colors.iconTint),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      state.pins.length > 1
                          ? t.t(
                              'chat.pinned.many',
                              {'n': '${state.pins.length}'},
                            )
                          : t.t('chat.pinned.title'),
                      style: type.caption.copyWith(
                        color: colors.gold,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      previewText(t, top),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(color: colors.text),
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

  Future<void> _openList(
    BuildContext context,
    WidgetRef ref,
    L10nFormats f,
  ) async {
    final t = ref.read(translatorProvider);
    await showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => Consumer(
        builder: (context, ref, _) {
          final pins = ref.watch(
            chatThreadProvider(conversationId).select((s) => s.pins),
          );
          final colors = Theme.of(context).extension<AppColorTokens>()!;
          final type = Theme.of(context).extension<AppTypographyTokens>()!;
          return SafeArea(
            child: ConstrainedBox(
              constraints: BoxConstraints(
                maxHeight: MediaQuery.sizeOf(context).height * 0.7,
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const AppSheetHandle(),
                  Padding(
                    padding: const EdgeInsets.fromLTRB(
                      AppSpacing.screenSide,
                      0,
                      AppSpacing.screenSide,
                      AppSpacing.sm,
                    ),
                    child: Align(
                      alignment: AlignmentDirectional.centerStart,
                      child: Text(
                        t.t('chat.pinned.sheet'),
                        style: type.titleMedium.copyWith(color: colors.text),
                      ),
                    ),
                  ),
                  Flexible(
                    child: ListView(
                      shrinkWrap: true,
                      children: [
                        for (final m in pins)
                          Padding(
                            padding: const EdgeInsetsDirectional.only(
                              start: AppSpacing.screenSide,
                              end: AppSpacing.xs,
                            ),
                            child: Row(
                              children: [
                                Expanded(
                                  child: Column(
                                    crossAxisAlignment:
                                        CrossAxisAlignment.start,
                                    children: [
                                      Text(
                                        previewText(t, m),
                                        maxLines: 2,
                                        overflow: TextOverflow.ellipsis,
                                        style: type.body
                                            .copyWith(color: colors.text),
                                      ),
                                      Text(
                                        f.time(m.createdAt),
                                        style: type.caption.copyWith(
                                          color: colors.textSecondary,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                                AppIconButton(
                                  icon: AppIcon(
                                    AppIcons.pushPin,
                                    color: colors.iconTint,
                                  ),
                                  semanticLabel: t.t('chat.act.unpin'),
                                  onPressed: () async {
                                    final n = ref.read(
                                      chatThreadProvider(conversationId)
                                          .notifier,
                                    );
                                    try {
                                      await n.setPinned(m, pinned: false);
                                    } on Object catch (e) {
                                      if (context.mounted) {
                                        showAppSnackBar(
                                          context,
                                          _errorOf(t, e),
                                        );
                                      }
                                    }
                                    if (pins.length <= 1 && sheet.mounted) {
                                      Navigator.of(sheet).pop();
                                    }
                                  },
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

/// The bar that replaces the header while messages are selected.
class SelectionBar extends ConsumerWidget implements PreferredSizeWidget {
  const SelectionBar({required this.conversationId, super.key});

  final String conversationId;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final ids = ref.watch(chatMsgSelectionProvider(conversationId));
    final state = ref.watch(chatThreadProvider(conversationId));
    final picked = [
      for (final m in state.all)
        if (ids.contains(m.id)) m,
    ];
    final selection =
        ref.read(chatMsgSelectionProvider(conversationId).notifier);
    final canCopy = picked.any(
      (m) => m.kind == MessageKind.text && !m.revoked,
    );
    final canFwd = picked.isNotEmpty && picked.every(canForward);
    return AppTopBar(
      leading: AppIconButton(
        icon: AppIcon(AppIcons.closeRounded, color: colors.text),
        semanticLabel: t.t('common.cancel'),
        onPressed: selection.clear,
      ),
      title: Text(
        t.t('chat.select.count', {'count': '${ids.length}'}),
        style: type.titleMedium.copyWith(color: colors.text),
      ),
      actions: [
        if (canCopy)
          AppIconButton(
            icon: AppIcon(AppIcons.copyOutlined, color: colors.text),
            semanticLabel: t.t('chat.act.copy'),
            onPressed: () async {
              await copyMessages(context, ref, picked);
              selection.clear();
            },
          ),
        if (canFwd)
          AppIconButton(
            icon: AppIcon(AppIcons.forwardRounded, color: colors.text),
            semanticLabel: t.t('chat.act.forward'),
            onPressed: () async {
              await pickForwardTargets(context, ref, picked);
              selection.clear();
            },
          ),
        AppIconButton(
          icon: AppIcon(AppIcons.deleteOutlineRounded, color: colors.text),
          semanticLabel: t.t('chat.act.delete'),
          onPressed: picked.isEmpty
              ? null
              : () async {
                  final done = await confirmDelete(
                    context,
                    ref,
                    conversationId,
                    picked,
                  );
                  if (done) selection.clear();
                },
        ),
      ],
    );
  }
}

/// Drag a bubble toward the middle to quote it (WhatsApp / Telegram).
class SwipeToReply extends StatefulWidget {
  const SwipeToReply({required this.child, required this.onReply, super.key});

  final Widget child;
  final VoidCallback onReply;

  @override
  State<SwipeToReply> createState() => _SwipeToReplyState();
}

class _SwipeToReplyState extends State<SwipeToReply>
    with SingleTickerProviderStateMixin {
  static const _trigger = 56.0;
  double _dx = 0;
  bool _fired = false;
  late final AnimationController _back = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 160),
  )..addListener(() => setState(() => _dx *= 1 - _back.value));

  @override
  void dispose() {
    _back.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final rtl = Directionality.of(context) == TextDirection.rtl;
    final shift = rtl ? -_dx : _dx;
    final progress = (_dx / _trigger).clamp(0.0, 1.0);
    return GestureDetector(
      behavior: HitTestBehavior.translucent,
      onHorizontalDragStart: (_) {
        _back.stop();
        _fired = false;
      },
      onHorizontalDragUpdate: (d) {
        final delta = rtl ? -d.delta.dx : d.delta.dx;
        final next = (_dx + delta).clamp(0.0, _trigger * 1.4);
        setState(() => _dx = next);
        if (!_fired && next >= _trigger) {
          _fired = true;
          HapticFeedback.selectionClick();
        }
      },
      onHorizontalDragEnd: (_) {
        if (_fired) widget.onReply();
        _back
          ..reset()
          ..forward();
      },
      onHorizontalDragCancel: () => _back
        ..reset()
        ..forward(),
      child: Stack(
        alignment: AlignmentDirectional.centerStart,
        children: [
          if (_dx > 4)
            Opacity(
              opacity: progress,
              child: Container(
                width: 30,
                height: 30,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: colors.surface,
                ),
                child: Center(
                  child: AppIcon(
                    AppIcons.replyRounded,
                    size: 18,
                    color: colors.iconTint,
                  ),
                ),
              ),
            ),
          Transform.translate(offset: Offset(shift, 0), child: widget.child),
        ],
      ),
    );
  }
}

/// "N unread messages" between the last read message and the first unread.
class UnreadDivider extends ConsumerWidget {
  const UnreadDivider({required this.count, super.key});

  final int count;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
      padding: const EdgeInsets.symmetric(vertical: 4),
      color: colors.goldTint.withValues(alpha: 0.5),
      alignment: Alignment.center,
      child: Text(
        t.t('chat.unread.divider', {'n': '$count'}),
        style: type.caption.copyWith(
          color: colors.text,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}
