import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/support/application/support_providers.dart';
import 'package:lawbid/features/support/domain/support_models.dart';

/// Owner 2026-10-02 — Settings → Help & support: my requests to the LawBid
/// team, a gold dot on the ones the team answered.
class SupportListScreen extends ConsumerWidget {
  const SupportListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(supportTicketsProvider);

    Widget card(SupportTicket s) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.md),
          child: AppPressable(
            onTap: () async {
              await context.push(AppRoutes.supportTicket(s.id));
              ref.invalidate(supportTicketsProvider);
            },
            child: Container(
              padding: const EdgeInsets.all(AppSpacing.lg),
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(
                  color: s.unread ? colors.goldStroke : colors.border,
                ),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          s.subject,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                          style: type.titleMedium.copyWith(
                            color: colors.text,
                            fontFamily: type.body.fontFamily,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: AppSpacing.xs),
                        Text(
                          '${t.t('support.category.${s.category.wire}')} · '
                          '${t.t('support.status.${s.status.wire}')} · '
                          '${f.date(s.lastMessageAt)}',
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (s.unread)
                    Container(
                      width: 10,
                      height: 10,
                      margin: const EdgeInsets.only(left: AppSpacing.md),
                      decoration: BoxDecoration(
                        color: colors.gold,
                        shape: BoxShape.circle,
                      ),
                    ),
                ],
              ),
            ),
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('support.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: Column(
          children: [
            Expanded(
              child: async.when(
                loading: () => Center(
                  child: CircularProgressIndicator(color: colors.gold),
                ),
                error: (e, _) => AppErrorState(
                  message: errorText(t, e),
                  retryLabel: t.t('error.retry'),
                  onRetry: () => ref.invalidate(supportTicketsProvider),
                ),
                data: (list) => list.isEmpty
                    ? AppEmptyState(
                        icon: AppIcons.helpOutlineRounded,
                        title: t.t('support.empty.title'),
                        message: t.t('support.empty.message'),
                      )
                    : RefreshIndicator(
                        color: colors.gold,
                        onRefresh: () async =>
                            ref.refresh(supportTicketsProvider.future),
                        child: ListView(
                          padding: const EdgeInsets.all(AppSpacing.screenSide),
                          children: [for (final s in list) card(s)],
                        ),
                      ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              child: AppButton(
                label: t.t('support.new'),
                icon: AppIcons.addRounded,
                onPressed: () async {
                  await context.push(AppRoutes.supportNew);
                  ref.invalidate(supportTicketsProvider);
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
