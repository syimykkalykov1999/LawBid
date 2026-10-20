import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Owner 2026-10-20 (Telegram): a chat row — a direct chat or a group — that
/// pins on a swipe right and mutes on a swipe left; the row springs back
/// (the action is done, the row stays in the list). Archive and delete live
/// in the long-press menu and in «Select chats».
class ChatSwipe extends ConsumerWidget {
  const ChatSwipe({
    required this.id,
    required this.pinned,
    required this.muted,
    required this.onPin,
    required this.onMute,
    required this.child,
    super.key,
  });

  /// The chat or group id (the keys of the row and of its strips).
  final String id;
  final bool pinned;
  final bool muted;
  final VoidCallback onPin;
  final VoidCallback onMute;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return Dismissible(
      key: ValueKey('chat-swipe-$id'),
      confirmDismiss: (dir) async {
        if (dir == DismissDirection.startToEnd) {
          onPin();
        } else {
          onMute();
        }
        return false;
      },
      background: _SwipeBackground(
        key: ValueKey('chat-swipe-pin-$id'),
        icon: pinned ? AppIcons.pushPinOutlined : AppIcons.pushPin,
        label: t.t(pinned ? 'chat.organize.unpin' : 'chat.organize.pin'),
        alignEnd: false,
      ),
      secondaryBackground: _SwipeBackground(
        key: ValueKey('chat-swipe-mute-$id'),
        icon: AppIcons.notificationsOffOutlined,
        label: t.t(muted ? 'chat.unmute' : 'chat.mute'),
        alignEnd: true,
      ),
      child: child,
    );
  }
}

/// The coloured strip behind a swiped chat row.
class _SwipeBackground extends StatelessWidget {
  const _SwipeBackground({
    required this.icon,
    required this.label,
    required this.alignEnd,
    super.key,
  });

  final IconData icon;
  final String label;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final fg = alignEnd ? AppColorsDark.text : colors.onAccent;
    return ColoredBox(
      color: alignEnd ? colors.navy : colors.gold,
      child: Align(
        alignment: alignEnd
            ? AlignmentDirectional.centerEnd
            : AlignmentDirectional.centerStart,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(icon, color: fg),
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: fg),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
