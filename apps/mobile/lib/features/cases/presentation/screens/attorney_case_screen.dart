import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/addresses/open_in_maps.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/application/case_views_queue.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/active_case_cards.dart'
    show caseStageOf;
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_cards.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_parts.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_tab_pages.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';
import 'package:lawbid/features/subscription/application/subscription_providers.dart';
import 'package:lawbid/features/subscription/domain/subscription_models.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/translation/data/content_translation_repository.dart';
import 'package:lawbid/features/translation/presentation/translatable_text.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// Opens the subscription call-to-action when the server answers
/// SUBSCRIPTION_REQUIRED (docs/04 §2); true when it handled [e].
bool routeSubscriptionError(
  BuildContext context,
  Object e, {
  String reason = 'generic',
}) {
  if (e is ApiException && e.code == ApiErrorCodes.subscriptionRequired) {
    context.push(AppRoutes.subscriptionRequiredFor(reason));
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
  bool _openedWork = false;

  @override
  void initState() {
    super.initState();
    // §4.3 view counter: once per screen open (server dedups per pair).
    // Owner 2026-10-22 (package A): batched with other views.
    ref.read(caseViewsQueueProvider).view(widget.caseId);
  }

  Future<void> _toggleSave(FeedCase c) async {
    final next = !(_savedOverride ?? c.isSaved);
    setState(() => _savedOverride = next);
    final t = ref.read(translatorProvider);
    try {
      await ref.read(caseActionsProvider).setSaved(c.id, saved: next);
      if (mounted) {
        showAppSnackBar(
          context,
          t.t(next ? 'cases.saved.added' : 'cases.saved.removed'),
        );
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _savedOverride = !next);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  /// Owner 2026-10-04: an attorney without an active subscription or trial
  /// gets the subscription offer (start the 7-day trial / subscribe)
  /// instead of a bid form the server would refuse. Assistants bid under
  /// the attorney's subscription — the server decides for them.
  Future<void> _bid(FeedCase c) async {
    if (ref.read(currentUserRoleProvider) == UserRole.attorney) {
      final overview = await ref
          .read(subscriptionOverviewProvider.future)
          .then<SubscriptionOverview?>((o) => o, onError: (Object _) => null);
      if (!mounted) return;
      if (overview != null && !overview.isActive) {
        await context.push(AppRoutes.subscriptionRequiredFor('bid'));
        return;
      }
    }
    if (mounted) await context.push(AppRoutes.placeBid(c.id));
  }

  Future<void> _message(FeedCase c) async {
    if (_messaging) return;
    setState(() => _messaging = true);
    final t = ref.read(translatorProvider);
    try {
      final conv = await ref.read(caseActionsProvider).openConversation(c.id);
      if (mounted) await context.push(ChatRoutes.conversation(conv.id));
    } on Object catch (e) {
      if (mounted && !routeSubscriptionError(context, e, reason: 'chat')) {
        showAppSnackBar(context, errorText(t, e));
      }
    } finally {
      if (mounted) setState(() => _messaging = false);
    }
  }

  /// Audit 2026-10-04: once the case left "open" with THIS attorney's
  /// bid accepted, the work screen (chat, completion, dispute) is the
  /// right place — the feed view would be a dead end.
  void _openWorkIfMine(FeedCase? c) {
    if (_openedWork ||
        c == null ||
        c.status == CaseStatus.open ||
        !c.acceptedBidIsMine) {
      return;
    }
    _openedWork = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) context.replace(AppRoutes.workCase(c.id));
    });
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(attorneyCaseProvider(widget.caseId));
    final c = value.value;
    final saved = _savedOverride ?? c?.isSaved ?? false;
    _openWorkIfMine(c);

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
                  ? AppIcons.bookmarkRounded
                  : AppIcons.bookmarkBorderRounded,
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
        builder: (c) => AppRefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.sheet,
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
                // Audit 2026-10-02: an assistant bids with "bids" or
                // drafts with "bid drafts", chats with "chats".
                if (c.bidAllowed &&
                    c.ownBidId == null &&
                    (ref.watch(canDoProvider(AssistantDuty.bids)) ||
                        ref.watch(canDoProvider(AssistantDuty.bidDrafts))))
                  AppButton(
                    key: const ValueKey('case-bid-cta'),
                    label: t.t('cases.bidForm.cta'),
                    onPressed: () => _bid(c),
                  ),
                if (c.bidAllowed &&
                    ref.watch(canDoProvider(AssistantDuty.chats)))
                  AppButton(
                    label: t.t('cases.detail.messageClient'),
                    icon: AppIcons.chatBubbleOutlineRounded,
                    variant: AppButtonVariant.secondary,
                    isLoading: _messaging,
                    onPressed: () => _message(c),
                  ),
              ],
            ),
    );
  }
}

class _Body extends ConsumerStatefulWidget {
  const _Body({required this.kase, required this.t, required this.formats});

  final FeedCase kase;
  final Translator t;
  final L10nFormats formats;

  @override
  ConsumerState<_Body> createState() => _BodyState();
}

class _BodyState extends ConsumerState<_Body> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final formats = widget.formats;
    final c = widget.kase;
    final category = CaseFormat.practice(
      t,
      c.practice.categoryI18nKey ?? c.practice.i18nKey,
      c.practice.categoryNameEn ?? c.practice.nameEn,
    );
    final leaf = CaseFormat.practice(t, c.practice.i18nKey, c.practice.nameEn);
    final filesCount = c.dossier.documentsCount + c.dossier.imagesCount;
    // Owner 2026-10-19 (Instagram): the case header scrolls away, the tab
    // row sticks, and Overview | Files are pages side by side — the next one
    // slides in with the finger, a tap slides to it.
    final scale = MediaQuery.textScalerOf(context).scale(1);
    return ProfileTabPages(
      initialPage: _tab,
      onPage: (i) => setState(() => _tab = i),
      tabBarHeight: 28 + 18 * scale,
      pagePadding: (_) => const EdgeInsets.only(bottom: AppSpacing.xxl),
      header: CaseHero(
        t: t,
        formats: formats,
        practiceName: [category, if (leaf != category) leaf].join(' · '),
        categoryCode: c.practice.artCode,
        statusLabel: c.ownBidId != null
            ? t.t('cases.hero.bidSent')
            : caseStatusLabel(t, c.status),
        statusTone: c.ownBidId != null ? StatusTone.info : caseTone(c.status),
        title: c.title,
        states: [c.primaryStateCode, ...c.additionalStateCodes],
        budget: c.budget,
        urgency: c.urgencyInfo,
        stage: caseStageOf(c.status, c.bidsCount),
        publishedAt: c.createdAt,
      ),
      tabBar: Builder(
        builder: (context) => CaseTextTabs(
          pages: ProfileTabPages.controllerOf(context),
          items: [
            CaseTabItem(t.t('cases.tab.overview')),
            CaseTabItem(
              t.t('cases.tab.files'),
              count: filesCount,
              locked: filesCount > 0 && c.photos.isEmpty,
            ),
          ],
          index: _tab,
          onChanged: (i) {
            final pages = ProfileTabPages.controllerOf(context);
            if (pages != null && pages.hasClients) {
              pages.animateToPage(
                i,
                duration: context.reduceMotion
                    ? Duration.zero
                    : const Duration(milliseconds: 250),
                curve: Curves.easeOutCubic,
              );
            } else {
              setState(() => _tab = i);
            }
          },
        ),
      ),
      pages: [
        for (final i in [0, 1])
          ConstrainedBox(
            constraints: BoxConstraints(
              minHeight: MediaQuery.sizeOf(context).height * 0.5,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: i == 0
                  ? _overview(context, c, t, formats)
                  : _files(context, c, t),
            ),
          ),
      ],
    );
  }

  List<Widget> _overview(
    BuildContext context,
    FeedCase c,
    Translator t,
    L10nFormats formats,
  ) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final type = typography;
    return [
      // Owner 2026-10-04: a case in a state without the attorney's
      // licence is still biddable; the client is told on the bid.
      if (!c.inMyLicensedStates && c.ownBidId == null)
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            0,
          ),
          child: OutsideStatesNote(t: t, forClient: false),
        ),
      // Owner 2026-09-30: another practice — bidding is allowed and the
      // client is told.
      if (!c.inMyPractice && c.ownBidId == null)
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.md,
            AppSpacing.lg,
            0,
          ),
          child: OutsidePracticeNote(t: t, forClient: false),
        ),
      if (c.ownBidId != null)
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.lg,
            AppSpacing.lg,
            AppSpacing.lg,
            0,
          ),
          child: _OwnBidCard(bidId: c.ownBidId!, t: t, formats: formats),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.lg,
          0,
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.t('cases.detail.where'),
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: 6),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final code in [
                  c.primaryStateCode,
                  ...c.additionalStateCodes,
                ])
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 6,
                    ),
                    decoration: BoxDecoration(
                      color: colors.chip,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      stateName(code),
                      style:
                          type.bodySmall.copyWith(fontWeight: FontWeight.w600),
                    ),
                  ),
                if (c.city != null && c.city!.trim().isNotEmpty)
                  // Owner 2026-10-28: the city opens in maps.
                  AppPressable(
                    key: const ValueKey('case-city'),
                    onTap: () => openAddressInMaps(
                      context,
                      t,
                      '${c.city!.trim()}, ${c.primaryStateCode}',
                    ),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: colors.chip,
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                        c.city!,
                        style: type.bodySmall
                            .copyWith(fontWeight: FontWeight.w600),
                      ),
                    ),
                  ),
              ],
            ),
          ],
        ),
      ),
      // Owner 2026-10-05: «Перевести» (cases zone).
      Padding(
        padding: const EdgeInsets.only(top: AppSpacing.xs),
        child: TranslatableText(
          kind: TranslatableKind.caseDescription,
          id: c.id,
          text: c.description ?? '',
          builder: (context, text) => CaseText(
            text: text,
            moreLabel: t.t('post.more'),
          ),
        ),
      ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.lg,
          AppSpacing.lg,
          0,
        ),
        child: Text(
          [
            t.t('cases.detail.published', {
              'date': formats.date(c.createdAt),
            }),
            t.t('cases.detail.activityValue', {
              'views': SocialFormat.count(formats, c.viewCount),
              'bids': SocialFormat.count(formats, c.bidsCount),
            }),
          ].join(' · '),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      ),
      // OQ-034: questions and answers under the case.
      AppListRow(
        icon: AppIcons.modeCommentOutlined,
        label: t.t('cases.comments.button'),
        trailingText: c.commentCount > 0
            ? SocialFormat.count(formats, c.commentCount)
            : null,
        onTap: () => context.push(AppRoutes.caseComments(c.id)),
      ),
    ];
  }

  List<Widget> _files(BuildContext context, FeedCase c, Translator t) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget row(IconData icon, String title, String sub) => Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.lg,
            vertical: AppSpacing.md,
          ),
          child: Row(
            children: [
              Container(
                width: 48,
                height: 48,
                decoration: BoxDecoration(
                  color: colors.chip,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: AppIcon(icon, color: colors.iconTint),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: type.body.copyWith(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      sub,
                      style:
                          type.bodySmall.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ),
              ),
              AppIcon(
                AppIcons.lockOutlineRounded,
                size: 18,
                color: colors.textSecondary,
              ),
            ],
          ),
        );
    final docs = c.dossier.documentsCount;
    final imgs = c.dossier.imagesCount;
    return [
      if (docs + imgs == 0)
        Padding(
          padding: const EdgeInsets.all(AppSpacing.lg),
          child: Text(
            t.t('cases.dossier.noFiles'),
            style: type.body.copyWith(color: colors.textSecondary),
          ),
        ),
      if (docs > 0)
        row(
          AppIcons.descriptionOutlined,
          t.t('cases.files.documents'),
          t.plural('cases.dossier.docs', docs),
        ),
      if (imgs > 0)
        row(
          AppIcons.imageOutlined,
          t.t('cases.files.photos'),
          t.plural('cases.dossier.photos', imgs),
        ),
      Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.lg,
          AppSpacing.sm,
          AppSpacing.lg,
          0,
        ),
        child: Text(
          t.t('cases.detail.privacyNote'),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      ),
    ];
  }
}

/// §4.3 "вместо кнопки «Сделать бид» показывается карточка его бида".
class _OwnBidCard extends ConsumerWidget {
  const _OwnBidCard({
    required this.bidId,
    required this.t,
    required this.formats,
  });

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
                    child: MoneyText(
                      CaseFormat.terms(
                        t,
                        formats,
                        value.feeType,
                        value.amountCents,
                        percentBps: value.percentBps,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  ConstrainedBox(
                    constraints: const BoxConstraints(maxWidth: 160),
                    child: BidStatusPill(
                      bid: value,
                      viewer: PartyRole.attorney,
                      t: t,
                    ),
                  ),
                ],
              ),
              if (!value.isFreeConsultation) ...[
                const SizedBox(height: AppSpacing.sm),
                RoundCounter(used: value.roundCount, t: t),
              ],
              const SizedBox(height: AppSpacing.md),
              Row(
                children: [
                  Flexible(
                    child: Text(
                      t.t('cases.detail.openBid'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.bodySmall.copyWith(
                        color: colors.goldDark,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  AppIcon(
                    AppIcons.chevronRightRounded,
                    color: colors.iconTint,
                    size: AppSizes.iconSm,
                  ),
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
