import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-14: the attorney's own numbers — profile opens, offers
/// sent and accepted in the last 30 days, and clients won through LawBid.
final attorneyStatsProvider = FutureProvider.autoDispose<api.AttorneyStatsDto>(
  (ref) async => (await guardApiCall(
    () => api.AttorneysClient(ref.watch(dioProvider)).getMyStats(),
  ))
      .data,
);

class AttorneyStatsScreen extends ConsumerWidget {
  const AttorneyStatsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final stats = ref.watch(attorneyStatsProvider);
    Widget tile(String label, int value) => Container(
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.border),
          ),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: type.bodySmall.copyWith(color: colors.textSecondary),
                ),
              ),
              Text(
                context.digits(value),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ],
          ),
        );
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppBar(title: Text(t.t('stats.title'))),
      body: stats.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, __) => Center(
          child: AppButton(
            label: t.t('common.retry'),
            variant: AppButtonVariant.secondary,
            onPressed: () => ref.invalidate(attorneyStatsProvider),
          ),
        ),
        data: (s) => ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            tile(t.t('stats.views'), s.profileViews30d),
            const SizedBox(height: AppSpacing.sm),
            tile(t.t('stats.sent'), s.bidsSent30d),
            const SizedBox(height: AppSpacing.sm),
            tile(t.t('stats.accepted'), s.bidsAccepted30d),
            const SizedBox(height: AppSpacing.sm),
            tile(t.t('stats.clients'), s.clientsTotal),
          ],
        ),
      ),
    );
  }
}
