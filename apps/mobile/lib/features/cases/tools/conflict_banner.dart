import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-20: before the attorney bids, the server looks for a
/// conflict of interest against their own past cases. A failed check is no
/// reason to hide the form, so an error is an empty answer.
final conflictCheckProvider =
    FutureProvider.autoDispose.family<api.ConflictCheckDto?, String>(
  (ref, caseId) async {
    try {
      final r = await guardApiCall(
        () => api.BidsClient(ref.watch(dioProvider)).conflictCheck(
          caseId: caseId,
        ),
      );
      return r.data;
    } on Object {
      return null;
    }
  },
  retry: (retryCount, error) => null,
);

/// A warning above the bid form: "You may have a conflict of interest",
/// with the earlier cases it comes from. Never blocks the bid.
class ConflictBanner extends ConsumerWidget {
  const ConflictBanner({required this.caseId, super.key});

  final String caseId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final check = ref.watch(conflictCheckProvider(caseId)).value;
    if (check == null || !check.conflict || check.matches.isEmpty) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        key: const ValueKey('conflict-banner'),
        padding: const EdgeInsets.all(AppSpacing.md),
        margin: const EdgeInsets.only(bottom: AppSpacing.lg),
        decoration: BoxDecoration(
          color: colors.dangerTint,
          borderRadius: BorderRadius.circular(AppRadii.field),
          border: Border.all(color: colors.danger),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                AppIcon(AppIcons.warningAmberRounded, color: colors.danger),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    t.t('conflict.title'),
                    style: typography.body.copyWith(
                      color: colors.dangerText,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('conflict.hint'),
              style: typography.bodySmall.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.sm),
            for (final m in check.matches)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Text(
                  t.t(
                    m.kind == api.ConflictMatchDtoKind.opposingParty
                        ? 'conflict.opposing'
                        : 'conflict.former',
                    {
                      'case': m.caseTitle,
                      'by': t.t('conflict.by.${m.by?.json ?? 'name'}'),
                    },
                  ),
                  style: typography.bodySmall.copyWith(color: colors.text),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
