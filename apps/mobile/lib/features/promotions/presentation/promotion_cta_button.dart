import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/chat/presentation/open_direct_chat.dart';
import 'package:lawbid/features/promotions/application/promotions_providers.dart';
import 'package:lawbid/features/promotions/domain/promotion_models.dart';
import 'package:lawbid/features/promotions/presentation/boost_colors.dart';
import 'package:url_launcher/url_launcher.dart';

/// Owner 2026-10-15: the button under a promoted post / reel — Learn more
/// (a site), Send message, View profile, Download, Call. A tap is counted as
/// a click for the advertiser's stats.
class PromotionCtaButton extends ConsumerWidget {
  const PromotionCtaButton({
    required this.promotionId,
    required this.cta,
    required this.authorId,
    required this.onProfile,
    this.onDark = false,
    super.key,
  });

  final String promotionId;
  final PromotionCta cta;
  final String authorId;
  final VoidCallback onProfile;

  /// Over a video (white outline) instead of a card.
  final bool onDark;

  Future<void> _tap(BuildContext context, WidgetRef ref) async {
    unawaited(ref.read(promotionsRepositoryProvider).click(promotionId));
    switch (cta.type) {
      case 'more':
      case 'download':
        final uri = Uri.tryParse(cta.value ?? '');
        if (uri != null && uri.scheme == 'https') {
          await launchUrl(uri, mode: LaunchMode.externalApplication);
        }
      case 'call':
        final phone = (cta.value ?? '').replaceAll(RegExp(r'[^\d+]'), '');
        if (phone.isNotEmpty) await launchUrl(Uri(scheme: 'tel', path: phone));
      case 'message':
        await openDirectChat(context, ref, authorId);
      case 'profile':
        onProfile();
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Owner 2026-10-19: an older ad's «Download» is not shown (a file link
    // can carry a virus).
    if (cta.type == 'download') return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final fg = onDark ? Colors.white : colors.boostInk();
    final border = onDark ? Colors.white70 : colors.goldStroke;
    // Compact: as wide as its text, at the start edge.
    return Align(
      alignment: AlignmentDirectional.centerStart,
      widthFactor: 1,
      heightFactor: 1,
      child: Semantics(
        button: true,
        child: AppPressable(
          onTap: () => _tap(context, ref),
          child: Container(
            constraints: const BoxConstraints(minHeight: 36),
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
            decoration: BoxDecoration(
              color: onDark ? Colors.black38 : colors.goldTint,
              borderRadius: BorderRadius.circular(AppRadii.pill),
              border: Border.all(color: border),
            ),
            alignment: Alignment.center,
            child: Text(
              t.t('boost.cta.${cta.type}'),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.body.copyWith(color: fg, fontWeight: FontWeight.w700),
            ),
          ),
        ),
      ),
    );
  }
}
