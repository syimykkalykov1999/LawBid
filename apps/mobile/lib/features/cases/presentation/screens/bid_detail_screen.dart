import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
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
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/cases/presentation/widgets/negotiation_timeline.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// docs/04 §5.2 bid detail + §6 negotiation, for both parties. Actions are
/// offered only to the side whose turn it is (§6.3); the server re-checks.
class BidDetailScreen extends ConsumerStatefulWidget {
  const BidDetailScreen({required this.bidId, this.listed, super.key});

  final String bidId;

  /// The row the client tapped (carries the attorney summary for the
  /// header — GET /bids/:id has no profile data).
  final CaseBid? listed;

  @override
  ConsumerState<BidDetailScreen> createState() => _BidDetailScreenState();
}

class _BidDetailScreenState extends ConsumerState<BidDetailScreen> {
  bool _busy = false;

  PartyRole get _viewer =>
      ref.read(actsAsAttorneyProvider)
          ? PartyRole.attorney
          : PartyRole.client;

  Future<void> _act(Future<Object?> Function() action, String doneKey) async {
    if (_busy) return;
    setState(() => _busy = true);
    final t = ref.read(translatorProvider);
    try {
      await action();
      if (mounted) showAppSnackBar(context, t.t(doneKey));
    } on ApiException catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, apiErrorText(t, e));
      ref.invalidate(bidProvider(widget.bidId));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _accept(CaseBid bid) async {
    final t = ref.read(translatorProvider);
    final client = _viewer == PartyRole.client;
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t(
          client ? 'cases.accept.clientTitle' : 'cases.accept.attorneyTitle'),
      message: t.t(client
          ? 'cases.accept.clientMessage'
          : 'cases.accept.attorneyMessage'),
      confirmLabel: t.t('cases.accept.confirm'),
    );
    if (ok) {
      await _act(
          () => ref.read(caseActionsProvider).accept(bid), 'cases.accept.done');
    }
  }

  Future<void> _counter(CaseBid bid) async {
    final t = ref.read(translatorProvider);
    final result = await showAppBottomSheet<(int, String)>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _CounterSheet(
        t: t,
        bid: bid,
        warnBinding: _viewer == PartyRole.client,
      ),
    );
    if (result == null) return;
    await _act(
      () => ref.read(caseActionsProvider).counter(bid, result.$1, result.$2),
      'cases.counter.done',
    );
  }

  Future<void> _decline(CaseBid bid) async {
    final t = ref.read(translatorProvider);
    final last = bid.roundCount >= kMaxNegotiationRounds;
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('cases.decline.title'),
      message: t.t(last ? 'cases.decline.lastRound' : 'cases.decline.message'),
      confirmLabel: t.t('cases.decline.confirm'),
      destructive: true,
    );
    if (ok) {
      await _act(() => ref.read(caseActionsProvider).decline(bid),
          'cases.decline.done');
    }
  }

  Future<void> _withdraw(CaseBid bid) async {
    final t = ref.read(translatorProvider);
    final ok = await showConfirmSheet(
      context,
      t: t,
      title: t.t('cases.withdraw.title'),
      message: t.t('cases.withdraw.message'),
      confirmLabel: t.t('cases.withdraw.confirm'),
      destructive: true,
    );
    if (ok) {
      await _act(() => ref.read(caseActionsProvider).withdraw(bid),
          'cases.withdraw.done');
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final value = ref.watch(bidProvider(widget.bidId));
    final viewer = _viewer;
    final bid = value.value;

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go(AppRoutes.mine),
        ),
        title: Text(t.t('cases.bid.title')),
      ),
      body: AsyncDetailBody<CaseBid>(
        value: value,
        t: t,
        onRetry: () => ref.invalidate(bidProvider(widget.bidId)),
        builder: (b) => RefreshIndicator(
          color: colors.gold,
          backgroundColor: colors.surface,
          onRefresh: () async {
            ref.invalidate(bidProvider(widget.bidId));
            await ref.read(bidProvider(widget.bidId).future);
          },
          child: _BidBody(
            bid: b,
            attorney: widget.listed?.attorney,
            viewer: viewer,
            t: t,
            formats: formats,
          ),
        ),
      ),
      bottomNavigationBar: bid == null ? null : _actions(bid, viewer, t),
    );
  }

  Widget? _actions(CaseBid bid, PartyRole viewer, Translator t) {
    if (!bid.isActive) return null;
    final myTurn = bid.isTurnOf(viewer);
    final children = <Widget>[
      if (myTurn)
        GavelStrikeButton(
          label: t.t('cases.accept.button'),
          strike: true,
          isLoading: _busy,
          onPressed: () => _accept(bid),
        ),
      // §6.3: the client may decline any active bid, whoever's turn it is;
      // a counter-offer only on the client's turn.
      if (viewer == PartyRole.client)
        ButtonPair(
          left: AppButton(
            label: t.t('cases.decline.button'),
            variant: AppButtonVariant.secondary,
            onPressed: _busy ? null : () => _decline(bid),
          ),
          right: AppButton(
            label: t.t('cases.counter.button'),
            variant: AppButtonVariant.secondary,
            isEnabled: myTurn && bid.canCounter,
            dimWhenDisabled: true,
            onPressed: _busy ? null : () => _counter(bid),
          ),
        ),
      if (viewer == PartyRole.attorney)
        ButtonPair(
          left: AppButton(
            label: t.t('cases.withdraw.button'),
            variant: AppButtonVariant.secondary,
            onPressed: _busy ? null : () => _withdraw(bid),
          ),
          right: AppButton(
            label: t.t('cases.counter.button'),
            variant: AppButtonVariant.secondary,
            isEnabled: myTurn && bid.canCounter,
            dimWhenDisabled: true,
            onPressed: _busy ? null : () => _counter(bid),
          ),
        ),
    ];
    return BottomActionBar(children: children);
  }
}

class _BidBody extends StatelessWidget {
  const _BidBody({
    required this.bid,
    required this.attorney,
    required this.viewer,
    required this.t,
    required this.formats,
  });

  final CaseBid bid;
  final BidAttorney? attorney;
  final PartyRole viewer;
  final Translator t;
  final L10nFormats formats;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final waiting = bid.isActive && !bid.isTurnOf(viewer);
    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: kDetailPadding,
      children: [
        if (attorney != null && viewer == PartyRole.client)
          AppEntrance(
            child: AttorneyLine(
              attorney: attorney!,
              t: t,
              formats: formats,
              onTap: attorney!.username.isEmpty
                  ? null
                  : () => context.push(AppRoutes.lawyer(attorney!.username)),
            ),
          ),
        if (viewer == PartyRole.attorney)
          AppEntrance(
            child: Align(
              alignment: Alignment.centerLeft,
              child: TextButton.icon(
                onPressed: () => context.push(AppRoutes.caseDetail(bid.caseId)),
                icon: Icon(Icons.description_outlined, color: colors.goldDark),
                label: Text(
                  t.t('cases.bid.openCase'),
                  style: typography.bodySmall.copyWith(
                      color: colors.goldDark, fontWeight: FontWeight.w600),
                ),
              ),
            ),
          ),
        const SizedBox(height: AppSpacing.lg),
        AppEntrance(
          index: 1,
          child: AppCard(
            elevated: true,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(
                        t.t('cases.bid.currentTerms'),
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                    ),
                    BidStatusPill(bid: bid, viewer: viewer, t: t),
                  ],
                ),
                const SizedBox(height: AppSpacing.xs),
                MoneyText(
                    CaseFormat.terms(t, formats, bid.feeType, bid.amountCents),
                    large: true),
                const SizedBox(height: AppSpacing.sm),
                Text(
                  [
                    CaseFormat.feeTypeLabel(t, bid.feeType),
                    CaseFormat.startLabel(
                        t, formats, bid.startAvailability, bid.startDate),
                    if (bid.estimatedDurationDays != null)
                      t.t('cases.bid.duration',
                          {'days': '${bid.estimatedDurationDays}'}),
                  ].join(' · '),
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
                if (!bid.isFreeConsultation) ...[
                  const SizedBox(height: AppSpacing.md),
                  RoundCounter(used: bid.roundCount, t: t),
                ],
              ],
            ),
          ),
        ),
        if (waiting) ...[
          const SizedBox(height: AppSpacing.md),
          AppEntrance(
            index: 2,
            child: Row(
              children: [
                Icon(Icons.schedule_rounded,
                    size: AppSpacing.lg, color: colors.info),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    t.t(viewer == PartyRole.client
                        ? 'cases.bid.waitingAttorney'
                        : 'cases.bid.waitingClient'),
                    style: typography.bodySmall
                        .copyWith(color: colors.textSecondary),
                  ),
                ),
              ],
            ),
          ),
        ],
        if (bid.outsidePractice)
          Padding(
            padding: const EdgeInsets.only(bottom: AppSpacing.md),
            child: OutsidePracticeNote(
                t: t, forClient: viewer == PartyRole.client),
          ),
        DetailSection(
          title: t.t('cases.bid.message'),
          child: Text(bid.message,
              style: typography.body.copyWith(color: colors.text)),
        ),
        DetailSection(
          title: t.t('cases.bid.history'),
          child: NegotiationTimeline(
              bid: bid, viewer: viewer, t: t, formats: formats),
        ),
      ],
    );
  }
}

/// §6.1 counter-offer: new amount (the fee type never changes) and an
/// optional message up to 500 chars. The client's counter is binding.
class _CounterSheet extends StatefulWidget {
  const _CounterSheet(
      {required this.t, required this.bid, required this.warnBinding});

  final Translator t;
  final CaseBid bid;
  final bool warnBinding;

  @override
  State<_CounterSheet> createState() => _CounterSheetState();
}

class _CounterSheetState extends State<_CounterSheet> {
  static const _messageMax = 500;
  final _amount = TextEditingController();
  final _message = TextEditingController();

  int? get _cents {
    final n = int.tryParse(_amount.text);
    return n == null || n <= 0 ? null : n * 100;
  }

  @override
  void dispose() {
    _amount.dispose();
    _message.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = widget.t;
    final remaining = kMaxNegotiationRounds - widget.bid.roundCount;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.lg),
              Text(t.t('cases.counter.title'),
                  style: typography.titleMedium.copyWith(color: colors.text)),
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t('cases.counter.remaining', {'n': '$remaining'}),
                style:
                    typography.bodySmall.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                controller: _amount,
                autofocus: true,
                label: widget.bid.feeType == FeeType.hourly
                    ? t.t('cases.counter.amountHourly')
                    : t.t('cases.counter.amount'),
                leading: Text('\$',
                    style: typography.titleMedium
                        .copyWith(color: colors.goldDark)),
                keyboardType: TextInputType.number,
                inputFormatters: [
                  FilteringTextInputFormatter.digitsOnly,
                  LengthLimitingTextInputFormatter(8),
                ],
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpacing.md),
              AppTextField(
                controller: _message,
                label: t.t('cases.counter.message'),
                maxLines: 3,
                maxLength: _messageMax,
                textCapitalization: TextCapitalization.sentences,
              ),
              if (widget.warnBinding) ...[
                const SizedBox(height: AppSpacing.md),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  decoration: BoxDecoration(
                    color: colors.goldTint,
                    borderRadius: BorderRadius.circular(AppRadii.field),
                  ),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(Icons.gavel_rounded,
                          size: AppSizes.iconSm, color: colors.goldDark),
                      const SizedBox(width: AppSpacing.sm),
                      Expanded(
                        child: Text(
                          t.t('cases.counter.bindingWarning'),
                          style:
                              typography.bodySmall.copyWith(color: colors.text),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: t.t('cases.counter.send'),
                isEnabled: _cents != null,
                dimWhenDisabled: true,
                onPressed: () =>
                    Navigator.of(context).pop((_cents!, _message.text)),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
