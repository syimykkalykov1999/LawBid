import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_header.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';

/// Opens the subscription call-to-action when the server answers
/// SUBSCRIPTION_REQUIRED (docs/04 §2); true when it handled [e].
bool routeSubscriptionError(BuildContext context, Object e) {
  if (e is ApiException && e.code == ApiErrorCodes.subscriptionRequired) {
    context.push(AppRoutes.subscriptionRequired);
    return true;
  }
  return false;
}

/// docs/04 §4.3 — case detail for an attorney: category and
/// specialization, title, description, states and city, budget, date,
/// views and bids; "Сохранить", "Сделать бид" (or the attorney's own bid),
/// "Написать клиенту". Never any client field.
class AttorneyCaseScreen extends ConsumerStatefulWidget {
  const AttorneyCaseScreen({required this.caseId, super.key});

  final String caseId;

  @override
  ConsumerState<AttorneyCaseScreen> createState() => _AttorneyCaseScreenState();
}

class _AttorneyCaseScreenState extends ConsumerState<AttorneyCaseScreen> {
  bool _messaging = false;
  bool? _savedOverride;

  @override
  void initState() {
    super.initState();
    // §4.3 view counter: once per screen open (server dedups per pair).
    ref
        .read(casesRepositoryProvider)
        .recordView(widget.caseId)
        .catchError((Object _) {});
  }

  Future<void> _toggleSave(FeedCase c) async {
    final next = !(_savedOverride ?? c.isSaved);
    setState(() => _savedOverride = next);
    final t = ref.read(translatorProvider);
    try {
      await ref.read(caseActionsProvider).setSaved(c.id, saved: next);
      if (mounted)
        showAppSnackBar(
            context, t.t(next ? 'cases.saved.added' : 'cases.saved.removed'));
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _savedOverride = !next);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  Future<void> _message(FeedCase c) async {
    if (_messaging) return;
    setState(() => _messaging = true);
    final t = ref.read(translatorProvider);
    try {
      await ref.read(caseActionsProvider).openConversation(c.id);
      // TODO(docs/05): navigate to the conversation screen.
      if (mounted) showAppSnackBar(context, t.t('cases.chat.created'));
    } on Object catch (e) {
      if (mounted && !routeSubscriptionError(context, e)) {
        showAppSnackBar(context, errorText(t, e));
      }
    } finally {
      if (mounted) setState(() => _messaging = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(attorneyCaseProvider(widget.caseId));
    final c = value.value;
    final saved = _savedOverride ?? c?.isSaved ?? false;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.feed),
        ),
        title: Text(t.t('cases.detail.title')),
        actions: [
          if (c != null)
            TopBarIcon(
              icon: saved
                  ? Icons.bookmark_rounded
                  : Icons.bookmark_border_rounded,
              color: saved ? colors.gold : null,
              label: t.t(saved ? 'cases.saved.remove' : 'cases.saved.add'),
              onTap: () => _toggleSave(c),
            ),
        ],
      ),
      body: AsyncDetailBody<FeedCase>(
        value: value,
        t: t,
        onRetry: () => ref.invalidate(attorneyCaseProvider(widget.caseId)),
        builder: (c) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.surface,
          onRefresh: () async {
            ref.invalidate(attorneyCaseProvider(widget.caseId));
            await ref.read(attorneyCaseProvider(widget.caseId).future);
          },
          child: _Body(kase: c, t: t, formats: formats),
        ),
      ),
      bottomNavigationBar: c == null || c.status != CaseStatus.open
          ? null
          : BottomActionBar(
              children: [
                if (c.ownBidId == null)
                  AppButton(
                    label: t.t('cases.bidForm.cta'),
                    icon: Icons.gavel_rounded,
                    onPressed: () => context.push(AppRoutes.placeBid(c.id)),
                  ),
                AppButton(
                  label: t.t('cases.detail.messageClient'),
                  icon: Icons.chat_bubble_outline_rounded,
                  variant: AppButtonVariant.secondary,
                  isLoading: _messaging,
                  onPressed: () => _message(c),
                ),
              ],
            ),
    );
  }
}

class _Body extends ConsumerWidget {
  const _Body({required this.kase, required this.t, required this.formats});

  final FeedCase kase;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final c = kase;
    final category = CaseFormat.practice(
      t,
      c.practice.categoryI18nKey ?? c.practice.i18nKey,
      c.practice.categoryNameEn ?? c.practice.nameEn,
    );
    final leaf = CaseFormat.practice(t, c.practice.i18nKey, c.practice.nameEn);
    final states = [c.primaryStateCode, ...c.additionalStateCodes]
        .map(stateName)
        .join(', ');
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: kDetailPadding,
      children: [
        CaseHeader(
          practice: category == leaf ? leaf : '$category · $leaf',
          title: c.title,
          status: c.status,
          meta: t
              .t('cases.detail.published', {'date': formats.date(c.createdAt)}),
          t: t,
          extra: c.isNew
              ? StatusPill(label: t.t('cases.card.new'), tone: StatusTone.gold)
              : null,
        ),
        if (c.ownBidId != null)
          DetailSection(
            title: t.t('cases.detail.yourBid'),
            child: _OwnBidCard(bidId: c.ownBidId!, t: t, formats: formats),
          ),
        DetailSection(
          title: t.t('cases.detail.description'),
          child: Text(c.description ?? '',
              style: typography.body.copyWith(color: colors.text)),
        ),
        DetailSection(
          title: t.t('cases.detail.details'),
          child: FactsCard(
            rows: [
              InfoRow(
                icon: Icons.payments_outlined,
                label: t.t('cases.card.budget'),
                value: CaseFormat.budget(t, formats, c.budget),
              ),
              InfoRow(
                  icon: Icons.map_outlined,
                  label: t.t('cases.field.states'),
                  value: states),
              if (c.city != null && c.city!.trim().isNotEmpty)
                InfoRow(
                    icon: Icons.place_outlined,
                    label: t.t('cases.field.city'),
                    value: c.city!),
              InfoRow(
                icon: Icons.insights_outlined,
                label: t.t('cases.detail.activity'),
                value: t.t('cases.detail.activityValue', {
                  'views': formats.number(c.viewCount),
                  'bids': formats.number(c.bidsCount),
                }),
              ),
            ],
          ),
        ),
        const SizedBox(height: AppSpacing.lg),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.lock_outline_rounded,
                size: AppSpacing.lg, color: colors.textSecondary),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('cases.detail.privacyNote'),
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
            ),
          ],
        ),
      ],
    );
  }
}

/// §4.3 "вместо кнопки «Сделать бид» показывается карточка его бида".
class _OwnBidCard extends ConsumerWidget {
  const _OwnBidCard(
      {required this.bidId, required this.t, required this.formats});

  final String bidId;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(bidProvider(bidId));
    return switch (value) {
      AsyncData(:final value) => AppCard(
          elevated: true,
          onTap: () => context.push(AppRoutes.bid(bidId)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(
                children: [
                  Expanded(
                      child: MoneyText(CaseFormat.terms(
                          t, formats, value.feeType, value.amountCents))),
                  BidStatusPill(bid: value, viewer: PartyRole.attorney, t: t),
                ],
              ),
              if (!value.isFreeConsultation) ...[
                const SizedBox(height: AppSpacing.sm),
                RoundCounter(used: value.roundCount, t: t),
              ],
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Text(
                    t.t('cases.detail.openBid'),
                    style: typography.bodySmall.copyWith(
                        color: colors.goldDark, fontWeight: FontWeight.w600),
                  ),
                  Icon(Icons.chevron_right_rounded,
                      color: colors.goldDark, size: AppSizes.iconSm),
                ],
              ),
            ],
          ),
        ),
      AsyncError(:final error) => CasesErrorView(
          error: error,
          t: t,
          onRetry: () => ref.invalidate(bidProvider(bidId)),
        ),
      _ => const AppContentCardSkeleton(),
    };
  }
}
