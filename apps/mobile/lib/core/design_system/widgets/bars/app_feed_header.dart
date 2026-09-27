import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/theme/app_color_tokens.dart';
import 'package:lawbid/core/design_system/tokens/app_sizes.dart';
import 'package:lawbid/core/design_system/tokens/app_spacing.dart';
import 'package:lawbid/core/design_system/widgets/display/scales_logo.dart';

/// Feed top bar (docs/01 §3 "Лента (верх): LawBid логотип слева, иконка
/// Чатов справа (бейдж)"; docs/07 §10: the logo is the scales, "уменьшенная
/// версия без анимации, ширина ≈ 96, без качания").
///
/// The logo is ALWAYS static here: [ScalesLogo] with `animated: false`
/// creates no ticker at all, and nothing in this header animates it (no
/// entrance swing either) — the swing belongs to the welcome screen only
/// (docs/07 §5.2).
///
/// [trailing] is the documented slot for the Chats icon with its unread
/// badge (docs/01 §3.1/§3.2 — built in file 05, "Лента/поиск/чаты/
/// уведомления"). Until then the slot stays empty: no placeholder icon
/// that would lead nowhere.
class AppFeedHeader extends StatelessWidget implements PreferredSizeWidget {
  const AppFeedHeader({
    required this.logoSemanticLabel,
    super.key,
    this.trailing = const [],
  });

  /// Screen-reader name of the logo (docs/07 §5.1: semantics label
  /// "LawBid"); also marks the header.
  final String logoSemanticLabel;

  /// Right-aligned actions — file 05's Chats icon + badge goes here.
  final List<Widget> trailing;

  @override
  Size get preferredSize => const Size.fromHeight(AppSizes.feedHeader);

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final topInset = MediaQuery.paddingOf(context).top;
    return Container(
      height: AppSizes.feedHeader + topInset,
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        topInset,
        AppSpacing.screenSide - AppSpacing.xs,
        0,
      ),
      decoration: BoxDecoration(
        color: colors.bg,
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: Row(
        children: [
          Semantics(
            header: true,
            child: ScalesLogo(
              size: AppSizes.feedHeaderLogo,
              semanticLabel: logoSemanticLabel,
            ),
          ),
          const Spacer(),
          ...trailing,
        ],
      ),
    );
  }
}
