import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// Owner 2026-10-21 (Telegram): the bar that replaces a group chat's header
/// while messages are selected — how many, Copy and Forward; in a group
/// that restricts saving content only «Share link». Icons with tooltips
/// (compact at 360 dp in every language).
class GroupSelectionBar extends ConsumerWidget implements PreferredSizeWidget {
  const GroupSelectionBar({
    required this.count,
    required this.onClose,
    this.onCopy,
    this.onForward,
    this.onShareLink,
    super.key,
  });

  final int count;
  final VoidCallback onClose;

  /// Null: hidden (nothing to copy, or the group is protected).
  final VoidCallback? onCopy;
  final VoidCallback? onForward;
  final VoidCallback? onShareLink;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget action(String key, IconData icon, String label, VoidCallback tap) =>
        Tooltip(
          message: label,
          child: AppIconButton(
            key: ValueKey(key),
            icon: AppIcon(icon, color: colors.text),
            semanticLabel: label,
            onPressed: tap,
          ),
        );
    return AppTopBar(
      leading: AppIconButton(
        key: const ValueKey('group-select-close'),
        icon: AppIcon(AppIcons.closeRounded, color: colors.text),
        semanticLabel: t.t('common.cancel'),
        onPressed: onClose,
      ),
      title: Text(
        t.t('chat.select.count', {'count': context.digits(count)}),
        maxLines: 1,
        overflow: TextOverflow.ellipsis,
        style: type.titleMedium.copyWith(color: colors.text),
      ),
      actions: [
        if (onCopy != null)
          action(
            'group-select-copy',
            AppIcons.copyOutlined,
            t.t('chat.act.copy'),
            onCopy!,
          ),
        if (onForward != null)
          action(
            'group-select-forward',
            AppIcons.forwardRounded,
            t.t('chat.act.forward'),
            onForward!,
          ),
        if (onShareLink != null)
          action(
            'group-select-share',
            AppIcons.linkRounded,
            t.t('chat.forward.shareLink'),
            onShareLink!,
          ),
      ],
    );
  }
}
