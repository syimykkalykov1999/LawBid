import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart'
    show showConfirmSheet;
import 'package:lawbid/shared/presentation/edge_swipe.dart';

/// Owner 2026-10-20 (Telegram): a chat row — a direct chat or a group — that
/// pins on a swipe right and mutes on a swipe left; the row springs back
/// (the action is done, the row stays in the list). Archive and delete live
/// in the long-press menu and in «Select chats»; a long swipe left also
/// deletes (R-055, with a confirm sheet). The swipe only starts at the
/// two edges of the row (see [EdgeSwipe]); in the middle it changes the
/// section.
class ChatSwipe extends ConsumerWidget {
  const ChatSwipe({
    required this.id,
    required this.pinned,
    required this.muted,
    required this.onPin,
    required this.onMute,
    required this.child,
    this.onDelete,
    super.key,
  });

  /// The chat or group id (the keys of the row and of its strips).
  final String id;
  final bool pinned;
  final bool muted;
  final VoidCallback onPin;
  final VoidCallback onMute;

  /// Owner 2026-10-22 (R-055): the long swipe left shows «Удалить» (asks
  /// first; the caller owns the confirm sheet). Null: no delete swipe.
  final VoidCallback? onDelete;
  final Widget child;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    return KeyedSubtree(
      key: ValueKey('chat-swipe-$id'),
      child: EdgeSwipe(
        onStart: onPin,
        onEnd: onMute,
        onEndFar: onDelete,
        endFarBackground: onDelete == null
            ? null
            : _SwipeBackground(
                key: ValueKey('chat-swipe-delete-$id'),
                icon: AppIcons.deleteOutlineRounded,
                label: t.t('chat.select.delete'),
                alignEnd: true,
                danger: true,
              ),
        startBackground: _SwipeBackground(
          key: ValueKey('chat-swipe-pin-$id'),
          icon: pinned ? AppIcons.pushPinOutlined : AppIcons.pushPin,
          label: t.t(pinned ? 'chat.organize.unpin' : 'chat.organize.pin'),
          alignEnd: false,
        ),
        endBackground: _SwipeBackground(
          key: ValueKey('chat-swipe-mute-$id'),
          icon: AppIcons.notificationsOffOutlined,
          label: t.t(muted ? 'chat.unmute' : 'chat.mute'),
          alignEnd: true,
        ),
        child: child,
      ),
    );
  }
}

/// Owner 2026-10-22 (R-055): the confirm sheet of the delete swipe — the
/// same sheet and texts as «Select chats → delete» (the chat leaves my list
/// only, `organize(hidden: true)`).
Future<void> confirmDeleteChat(
  BuildContext context, {
  required Translator t,
  required Future<void> Function() onConfirmed,
  bool group = false,
}) async {
  final ok = await showConfirmSheet(
    context,
    t: t,
    title: t.t('chat.select.deleteTitle', {'count': '1'}),
    message: t.t(
      group ? 'group.select.hideMessage' : 'chat.select.deleteMessage',
    ),
    confirmLabel: t.t('chat.select.delete'),
    destructive: true,
  );
  if (ok) await onConfirmed();
}

/// The coloured strip behind a swiped chat row.
class _SwipeBackground extends StatelessWidget {
  const _SwipeBackground({
    required this.icon,
    required this.label,
    required this.alignEnd,
    this.danger = false,
    super.key,
  });

  final bool danger;
  final IconData icon;
  final String label;
  final bool alignEnd;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final fg = danger
        ? colors.onDanger
        : (alignEnd ? AppColorsDark.text : colors.onAccent);
    return ColoredBox(
      color: danger ? colors.danger : (alignEnd ? colors.navy : colors.gold),
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
