import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/search/presentation/widgets/public_attorney_tile.dart';
import 'package:lawbid/shared/presentation/guest_gate.dart';

/// Owner 2026-10-22 (guest browsing, decision A1): the Feed tab without an
/// account — the LawBid header, a card that says what an account gives and
/// the public directory of verified attorneys (the only list the API
/// serves without a token today; posts and reels follow once
/// `GET /feed/*` accepts a guest — see the worker report).
class GuestFeedScreen extends ConsumerWidget {
  const GuestFeedScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppFeedHeader(logoSemanticLabel: t.t('brand.name')),
      body: const PublicDirectoryList(header: _SignInCard()),
    );
  }
}

class _SignInCard extends ConsumerWidget {
  const _SignInCard();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenSide,
        AppSpacing.md,
        AppSpacing.screenSide,
        0,
      ),
      child: Container(
        key: const ValueKey('guest-feed-card'),
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: colors.surface,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: colors.border),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('guest.gate.title'),
              style: type.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('guest.feed.hint'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              key: const ValueKey('guest-feed-sign-in'),
              label: t.t('guest.signIn'),
              height: 40,
              onPressed: () => openSignIn(context, ref),
            ),
          ],
        ),
      ),
    );
  }
}
