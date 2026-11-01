import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/shell/desktop_input.dart';
import 'package:lawbid/core/navigation/shell/desktop_layouts.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/chat_list_merge.dart';

/// Desktop web plan 2026-10-28 §5.3 / §6.3: on a desktop window `/inbox`
/// and `/chat/:id` are one page — the chats list on the left and the open
/// chat (or an empty pane) on the right, like WhatsApp Web. Under the
/// desktop width [phone] is returned as it is: the phone and the tablet
/// see exactly the screens they had.
class ChatsAdaptivePage extends StatelessWidget {
  const ChatsAdaptivePage({
    required this.phone,
    this.conversationId,
    this.tab = InboxTab.chats,
    super.key,
  });

  /// What the route showed before (the inbox, or the one chat).
  final Widget phone;

  /// The open chat (null: `/inbox`).
  final String? conversationId;
  final InboxTab tab;

  @override
  Widget build(BuildContext context) {
    if (!isDesktopWindow(context)) return phone;
    return DesktopChatsPage(
      conversationId: conversationId,
      tab: tab,
      detail: conversationId == null ? null : phone,
    );
  }
}

/// The open chat of the desktop chats page, for the rows of the list (the
/// open one is highlighted) and for the chat itself (back = empty pane).
class DesktopChatScope extends InheritedWidget {
  const DesktopChatScope({
    required this.selectedId,
    required super.child,
    super.key,
  });

  final String? selectedId;

  /// The open chat's id; null outside the desktop chats page or when no
  /// chat is open. Rebuilds [context] when another chat opens.
  static String? selectedIdOf(BuildContext context) => context
      .dependOnInheritedWidgetOfExactType<DesktopChatScope>()
      ?.selectedId;

  /// Whether [context] is inside the desktop chats page.
  static bool inPage(BuildContext context) =>
      context.getInheritedWidgetOfExactType<DesktopChatScope>() != null;

  @override
  bool updateShouldNotify(DesktopChatScope oldWidget) =>
      selectedId != oldWidget.selectedId;
}

/// Swaps the desktop chats page to [location] in place: no page animation,
/// the list keeps its state and place, and the browser's Back does not
/// collect every chat that was opened.
void _swap(BuildContext context, String location) {
  final router = GoRouter.of(context);
  Router.neglect(context, () => router.replace<void>(location));
}

/// Opens a chat from the chats list: on the desktop page it opens in the
/// right pane, on a phone it is pushed as before.
void openChat(BuildContext context, String id) {
  if (DesktopChatScope.inPage(context)) {
    _swap(context, ChatRoutes.conversation(id));
  } else {
    context.push(ChatRoutes.conversation(id));
  }
}

/// The chat's back arrow: on the desktop page the right pane goes back to
/// empty; elsewhere the chat closes as before.
void closeChat(BuildContext context) {
  if (DesktopChatScope.inPage(context)) {
    _swap(context, ChatRoutes.inbox);
  } else {
    Navigator.of(context).maybePop();
  }
}

/// The desktop chats page itself (see [ChatsAdaptivePage]).
class DesktopChatsPage extends ConsumerWidget {
  const DesktopChatsPage({
    required this.tab,
    this.conversationId,
    this.detail,
    super.key,
  });

  final String? conversationId;
  final InboxTab tab;

  /// The open chat's screen (null: the empty pane).
  final Widget? detail;

  /// The chats of the list in its order (direct chats; groups open as
  /// their own page).
  List<String> _chatIds(WidgetRef ref) => [
        for (final e in ref.read(mergedChatListProvider).value?.items ??
            const <ChatListEntry>[])
          if (e is DirectChatEntry) e.conversation.id,
      ];

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Notifications: one readable column (plan §6.3: nothing to show on
    // the right until a notification is opened).
    if (tab == InboxTab.notifications) {
      return const ContentColumn(
        maxWidth: kShellContentMaxWidth,
        child: InboxScreen(
          key: ValueKey('desktop-inbox-notifications'),
          initialTab: InboxTab.notifications,
        ),
      );
    }
    final id = conversationId;
    return DesktopChatScope(
      selectedId: id,
      child: DesktopKeyBindings(
        onSearch: () => ref.read(chatSearchOpenProvider.notifier).open(),
        onEscape: () {
          if (id == null) return false;
          _swap(context, ChatRoutes.inbox);
          return true;
        },
        onStep: (delta) {
          final ids = _chatIds(ref);
          if (ids.isEmpty) return;
          final at = id == null ? -1 : ids.indexOf(id);
          final next = at < 0 ? 0 : (at + delta).clamp(0, ids.length - 1);
          if (ids[next] != id) {
            _swap(context, ChatRoutes.conversation(ids[next]));
          }
        },
        child: ListDetailLayout(
          list: InboxScreen(
            key: const ValueKey('desktop-inbox-list'),
            initialTab: tab,
          ),
          detail: id == null
              ? const _EmptyChatPane()
              : KeyedSubtree(
                  key: ValueKey('desktop-chat-$id'),
                  child: detail ?? const SizedBox.shrink(),
                ),
        ),
      ),
    );
  }
}

/// The right pane while no chat is open.
class _EmptyChatPane extends ConsumerWidget {
  const _EmptyChatPane();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return Material(
      key: const ValueKey('desktop-chat-empty'),
      color: colors.bg,
      child: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppIcon(
              AppIcons.chatBubbleOutlineRounded,
              size: 72,
              color: colors.textSecondary,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('inbox.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
          ],
        ),
      ),
    );
  }
}
