import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/haptics/app_haptics.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/chat_thread_memory.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_folders.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/chat/presentation/message_context_menu.dart';
import 'package:lawbid/features/social/application/social_providers.dart';

/// Owner row 95 (2026-11-13, owner «Конечно»): a long press on a chat in
/// the list lifts a preview of that chat over the blurred list with its
/// quick actions under it — the iOS context-menu preview
/// (`CupertinoContextMenu`, BSD-3, the same route as the message menu) and
/// Telegram's / iMessage's chat peek. A tap on the preview opens the chat.
///
/// The peek reads only what the phone already has (the chat's page in
/// memory, else the phone's copy): no server request, nothing is marked
/// read, the chat's notification stays.
Future<void> showChatPreviewMenu(
  BuildContext context,
  WidgetRef ref,
  Conversation c, {
  required VoidCallback onOpen,
  BuildContext? row,
  bool inArchive = false,
  String? noReplyMessageId,
}) async {
  unawaited(AppHaptics.medium());
  Rect? anchor;
  final box = row?.findRenderObject();
  if (box is RenderBox && box.hasSize && box.attached) {
    anchor = box.localToGlobal(Offset.zero) & box.size;
  }
  final screen = MediaQuery.sizeOf(context);
  final size = Size(
    math.min(screen.width - 32, 440),
    math.min(screen.height * 0.45, 440),
  );
  await showMessageContextMenu(
    context,
    anchor: anchor,
    preview: ChatPeek(conversation: c),
    previewSize: size,
    onPreviewTap: onOpen,
    actions: (_) => MessageMenuCard(
      child: ChatOrganizeActions(
        conversation: c,
        inArchive: inArchive,
        noReplyMessageId: noReplyMessageId,
      ),
    ),
  );
}

/// The newest messages of a chat, from the phone only (see
/// [showChatPreviewMenu]).
final chatPeekProvider =
    FutureProvider.autoDispose.family<List<ChatMessage>, String>((ref, id) {
  final memory = ref.read(chatThreadMemoryProvider);
  if (memory.contains(id)) {
    return memory.take(id) ?? const <ChatMessage>[];
  }
  final store = ref.read(messageStoreProvider);
  if (store == null) return const <ChatMessage>[];
  return store
      .page(id, limit: ChatPeek.count)
      .then((rows) => rows.map(ChatMappers.message).toList());
});

class ChatPeek extends ConsumerWidget {
  const ChatPeek({required this.conversation, super.key});

  /// How many of the newest messages the peek shows at most.
  static const int count = 20;

  final Conversation conversation;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final chat = ChatColors.of(context);
    final me = ref.watch(currentUserIdProvider);
    final c = conversation;
    final loaded = ref.watch(chatPeekProvider(c.id)).value;
    final shown = loaded == null || loaded.isEmpty
        ? [if (c.lastMessage != null) c.lastMessage!]
        : loaded.take(count).toList();
    return Material(
      key: ValueKey('chat-peek-${c.id}'),
      color: chat.wallpaper,
      child: Column(
        children: [
          Container(
            color: colors.surface,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm,
            ),
            child: Row(
              children: [
                CounterpartAvatar(counterpart: c.counterpart, size: 36),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    counterpartName(t, c),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
              ],
            ),
          ),
          Expanded(
            child: ListView.builder(
              // Newest at the bottom, like the chat itself.
              reverse: true,
              physics: const NeverScrollableScrollPhysics(),
              padding: const EdgeInsets.all(AppSpacing.sm),
              itemCount: shown.length,
              itemBuilder: (context, i) {
                final m = shown[i];
                final mine = m.senderId == me;
                return Align(
                  alignment: mine
                      ? AlignmentDirectional.centerEnd
                      : AlignmentDirectional.centerStart,
                  child: Container(
                    margin: const EdgeInsets.symmetric(vertical: 2),
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    constraints: const BoxConstraints(maxWidth: 300),
                    decoration: BoxDecoration(
                      color: mine ? chat.mine : chat.theirs,
                      borderRadius: BorderRadius.circular(14),
                      border:
                          mine ? null : Border.all(color: chat.theirsBorder),
                    ),
                    child: Text(
                      messagePreview(t, m, me: me),
                      maxLines: 6,
                      overflow: TextOverflow.ellipsis,
                      style: type.bodySmall.copyWith(
                        color: mine ? chat.onMine : chat.onTheirs,
                      ),
                    ),
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
