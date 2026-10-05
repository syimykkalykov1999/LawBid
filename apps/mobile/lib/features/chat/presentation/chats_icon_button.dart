import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';

/// The Feed header's Chats icon (docs/05 §2.1) with the §10 badge: unread
/// messages + unread notifications. The count pops when it changes.
class ChatsIconButton extends ConsumerWidget {
  const ChatsIconButton({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Audit 2026-10-04: assistants without "chats" get the bell — the
    // Inbox opened on its notifications.
    final chats = ref.watch(canDoProvider(AssistantDuty.chats));
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final total = ref.watch(
      badgesProvider.select((b) => chats ? b.total : b.notifications),
    );
    return Semantics(
      button: true,
      label: total > 0
          ? t.t('inbox.openWithCount', {'count': '$total'})
          : t.t('inbox.open'),
      excludeSemantics: true,
      child: AppTapTarget(
        child: AppPressable(
          onTap: () => context.push(
            chats
                ? ChatRoutes.inbox
                : ChatRoutes.inboxTab(InboxTab.notifications),
          ),
          child: SizedBox.square(
            dimension: AppSizes.touchTarget,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                AppIcon(
                  chats
                      ? AppIcons.forumOutlined
                      : AppIcons.notificationsNoneRounded,
                  color: colors.text,
                  size: AppSizes.iconMd,
                ),
                if (total > 0)
                  Positioned(
                    top: 4,
                    right: 0,
                    child: CountPill(count: total),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
