import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/pickers/app_pickers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/limits/text_limits.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/data/cases_repository.dart';
import 'package:lawbid/features/cases/deals/deal_record_data.dart';
import 'package:lawbid/features/cases/deals/pay_block.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/domain/contingency.dart';
import 'package:lawbid/features/cases/presentation/screens/attorney_case_screen.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_wizard_steps.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/cases/tools/conflict_banner.dart';
import 'package:lawbid/features/plans/presentation/plan_offer.dart';
import 'package:lawbid/features/profile/presentation/screens/firm_screen.dart'
    show myFirmProvider;
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// docs/04 §5.1 limits.
abstract final class BidLimits {
  static const messageMin = 20;
  static int get messageMax => TextLimits.of(TextLimit.bidMessage);
  static const amountMaxDollars = 10000000;
  static const durationMax = 3650;
}

/// docs/04 §5.1 — "Сделать бид": fee type, amount (hidden for a free
/// consultation), message, start, optional duration.
class BidFormScreen extends ConsumerStatefulWidget {
  const BidFormScreen({
    required this.caseId,
    this.initialAmountCents,
    super.key,
  });

  final String caseId;

  /// Owner 2026-10-05: answering a client's invite starts from the
  /// client's budget.
  final int? initialAmountCents;

  @override
  ConsumerState<BidFormScreen> createState() => _BidFormScreenState();
}

class _BidFormScreenState extends ConsumerState<BidFormScreen> {
  // Owner 2026-11-07: ONE «Оплата» block of tiles (prototype), «Сумма» on
  // first sight; an invite's amount starts from the client's budget, so it is
  // a fixed fee. Deal record 2026-10-27: the detailed terms ride on the same
  // tiles (admin switch).
  final _pay = PayDraft();
  // The attorney (or an invite) has chosen: a saved draft no longer overrides.
  late bool _payTouched = widget.initialAmountCents != null;
  StartAvailability _start = StartAvailability.immediately;
  DateTime? _startDate;
  final _message = TextEditingController();
  final _duration = TextEditingController();
  bool _busy = false;
  String? _error;
  String? _sendAs;

  /// OQ-048: who prepared the loaded draft (an assistant).
  String? _draftBy;

  /// R2-A #21: the form as it was opened (or last loaded / saved); leaving
  /// with anything else asks «Save draft?».
  String _clean = '';

  /// The form leaves on purpose (sent, saved, discarded): no question.
  bool _leaving = false;

  String get _snapshot => [
        _pay.feeType.json,
        _pay.amountCents,
        _message.text.trim(),
        _start.json,
        _startDate?.toIso8601String(),
        _duration.text.trim(),
      ].join('|');

  bool get _dirty => !_leaving && !_busy && _snapshot != _clean;

  @override
  void initState() {
    super.initState();
    final initial = widget.initialAmountCents;
    if (initial != null && initial > 0) {
      _pay.rich.flat.text = '${initial ~/ 100}';
    }
    _clean = _snapshot;
    _loadDraft();
  }

  /// A saved draft fills the form (the attorney reviews and sends it).
  Future<void> _loadDraft() async {
    try {
      final d = await ref.read(teamRepositoryProvider).bidDraft(widget.caseId);
      if (d == null || !mounted) return;
      // The draft only fills what the attorney has not touched yet: typed
      // text and the invite's prefilled amount win over it.
      setState(() {
        if (d.feeType != null && !_payTouched) {
          _pay.select(PayDraft.kindOfFee(FeeType.fromJson(d.feeType!)));
        }
        if (d.amountCents != null && _pay.main.text.trim().isEmpty) {
          _pay.main.text = '${d.amountCents! ~/ 100}';
        }
        if (d.message != null && _message.text.trim().isEmpty) {
          _message.text = d.message!;
        }
        if (d.startAvailability != null &&
            _start == StartAvailability.immediately) {
          _start = StartAvailability.fromJson(d.startAvailability!);
        }
        _startDate ??= d.startDate;
        if (d.estimatedDurationDays != null && _duration.text.trim().isEmpty) {
          _duration.text = '${d.estimatedDurationDays}';
        }
        // My own saved draft (R2-A #21) has no «prepared by» line.
        _draftBy = d.preparedBy;
        _clean = _snapshot;
      });
    } on Object {
      // No draft or offline: an empty form.
    }
  }

  /// OQ-048: an assistant saves a draft instead of sending.
  Future<void> _saveDraft() async {
    final t = ref.read(translatorProvider);
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _saveDraftOnServer();
      if (!mounted) return;
      showAppSnackBar(context, t.t('bidDraft.saved'));
      _leaveNow();
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = errorText(t, e);
        });
      }
    }
  }

  /// R2-A #21 (Instagram «Save draft?», Gmail): back, the edge swipe and
  /// the top bar's back button ask before typed work is lost. The draft is
  /// the same server copy an assistant's draft uses; it fills the form the
  /// next time this case's bid form opens.
  Future<void> _confirmLeave() async {
    final t = ref.read(translatorProvider);
    final choice = await showAppBottomSheet<_LeaveChoice>(
      context: context,
      builder: (context) => _LeaveBidSheet(t: t),
    );
    if (!mounted) return;
    switch (choice) {
      case _LeaveChoice.save:
        setState(() {
          _busy = true;
          _error = null;
        });
        try {
          await _saveDraftOnServer();
          if (!mounted) return;
          showAppSnackBar(context, t.t('cases.bidForm.leave.saved'));
          _leaveNow();
        } on Object catch (e) {
          if (mounted) {
            setState(() {
              _busy = false;
              _error = errorText(t, e);
            });
          }
        }
      case _LeaveChoice.discard:
        _leaveNow();
      case _LeaveChoice.stay || null:
        return;
    }
  }

  /// R2-A #2: opened by a link or after a web refresh, the form is alone on
  /// the stack — back leads to the case.
  void _leaveNow() {
    setState(() => _leaving = true);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.canPop()
          ? context.pop()
          : context.go(AppRoutes.caseDetail(widget.caseId));
    });
  }

  Future<void> _back() async {
    if (_dirty) return _confirmLeave();
    _leaveNow();
  }

  Future<void> _saveDraftOnServer() =>
      ref.read(teamRepositoryProvider).saveBidDraft(
            widget.caseId,
            feeType: _pay.feeType.json,
            amountCents: _pay.amountCents,
            message: _message.text.trim().isEmpty ? null : _message.text,
            startAvailability: _start.json,
            startDate: _startDate,
            estimatedDurationDays: int.tryParse(_duration.text),
          );

  ContingencyRules get _rules =>
      ContingencyRules.of(ref.read(featureFlagsControllerProvider));

  bool get _amountOk => _pay.ok(
        rules: _rules,
        richOn: ref.read(richTermsEnabledProvider),
        maxDollars: BidLimits.amountMaxDollars,
      );

  bool get _messageOk {
    final n = _message.text.trim().length;
    return n >= BidLimits.messageMin && n <= BidLimits.messageMax;
  }

  bool get _startOk =>
      _start != StartAvailability.customDate || _startDate != null;

  bool get _durationOk {
    if (_duration.text.isEmpty) return true;
    final n = int.tryParse(_duration.text);
    return n != null && n >= 1 && n <= BidLimits.durationMax;
  }

  bool get _valid => _amountOk && _messageOk && _startOk && _durationOk;

  @override
  void dispose() {
    _message.dispose();
    _duration.dispose();
    _pay.dispose();
    super.dispose();
  }

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showAppDatePicker(
      context: context,
      initialDate: _startDate ?? now,
      firstDate: DateTime(now.year, now.month, now.day),
      lastDate: now.add(const Duration(days: 365 * 2)),
    );
    // R2-A #21 (iOS: cancelling a picker keeps the previous choice): the
    // «Pick date» chip is chosen only once a date is picked.
    if (picked != null && mounted) {
      setState(() {
        _start = StartAvailability.customDate;
        _startDate = picked;
      });
    }
  }

  Future<void> _submit() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    final t = ref.read(translatorProvider);
    try {
      // Owner 2026-11-07: the chosen tile builds the same request the two
      // old blocks did (fee type + amount, and the detailed terms).
      final richOn = ref.read(richTermsEnabledProvider);
      final bid = await ref.read(caseActionsProvider).placeBid(
            widget.caseId,
            BidInput(
              feeType: _pay.feeType,
              amountCents: _pay.amountCents,
              percentBps: _pay.percentBps(_rules),
              message: _message.text,
              startAvailability: _start,
              startDate: _startDate,
              estimatedDurationDays: int.tryParse(_duration.text),
              sendAsAttorneyId: _sendAs,
              paymentTerms: _pay.terms(
                richOn: richOn,
                percentAllowed: _percentAllowed(),
              ),
            ),
          );
      if (!mounted) return;
      showAppSnackBar(context, t.t('cases.bidForm.sent'));
      setState(() => _leaving = true);
      context.pushReplacement(AppRoutes.bid(bid.id));
    } on Object catch (e) {
      if (!mounted) return;
      if (routeSubscriptionError(context, e, reason: 'bid')) {
        setState(() => _busy = false);
        return;
      }
      // Owner 2026-10-14: the month's offers are used up — say so and offer
      // the plans in the same bar.
      // Firms audit 16.11 (PR-4, owner): one bid per firm per case — a
      // colleague already sent it; offer to join it instead.
      if (e is ApiException && e.code == ApiErrorCodes.firmBidExists) {
        setState(() => _busy = false);
        await _offerJoin(e);
        return;
      }
      if (e is ApiException &&
          (e.code == ApiErrorCodes.bidMonthlyLimitReached ||
              e.code == ApiErrorCodes.bidTrialLimitReached)) {
        setState(() => _busy = false);
        showErrorOrPlans(context, ref, e);
        return;
      }
      setState(() {
        _busy = false;
        _error = errorText(t, e);
      });
    }
  }

  /// «Ваш коллега уже предложил ставку» + «Присоединиться» (the same
  /// confirm sheet as elsewhere); joining tells the colleague.
  Future<void> _offerJoin(ApiException e) async {
    final t = ref.read(translatorProvider);
    final d = e.details ?? const <String, dynamic>{};
    final bidId = d['bidId'];
    if (bidId is! String) {
      setState(() => _error = errorText(t, e));
      return;
    }
    final name =
        [d['firstName'], d['lastName']].whereType<String>().join(' ').trim();
    final join = await showConfirmSheet(
      context,
      t: t,
      title: t.t('bid.firm.colleague.title'),
      message: t.t('bid.firm.colleague.message', {'name': name}),
      confirmLabel: t.t('bid.firm.join'),
    );
    if (!join || !mounted) return;
    setState(() => _busy = true);
    try {
      await ref.read(caseActionsProvider).joinFirmBid(widget.caseId, bidId);
      if (!mounted) return;
      showAppSnackBar(context, t.t('bid.firm.joined'));
      setState(() => _leaving = true);
      context.pop();
    } on Object catch (err) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = errorText(t, err);
      });
    }
  }

  /// The admin's list of topics without a percent; the server checks it too.
  bool _percentAllowed({bool watch = false}) {
    final kase = (watch
            ? ref.watch(attorneyCaseProvider(widget.caseId))
            : ref.read(attorneyCaseProvider(widget.caseId)))
        .value;
    final flags = watch
        ? ref.watch(featureFlagsControllerProvider)
        : ref.read(featureFlagsControllerProvider);
    return kase == null ||
        !ContingencyRules.of(flags)
            .blockedFor([kase.practice.code, ...kase.extraPracticeCodes]);
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    // The admin's list of topics without a percent; the server checks it too.
    final percentAllowed = _percentAllowed(watch: true);
    final richOn = ref.watch(richTermsEnabledProvider);
    // A percent or a mixed tile cannot stand on a topic without a percent,
    // nor the detailed tiles while their switch is off: back to «Сумма».
    final gone = (!percentAllowed && _pay.kind == PayKind.percent) ||
        (!richOn &&
            (_pay.kind == PayKind.installments || _pay.kind == PayKind.mixed));
    if (gone) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) setState(() => _pay.select(PayKind.flat));
      });
    }
    // OQ-049: an assistant sends bids only with the "bids" access the
    // attorney switched on (under their responsibility); else a draft.
    final assistant = ref.watch(isAssistantProvider) &&
        !ref.watch(canDoProvider(AssistantDuty.bids));
    return PopScope(
      canPop: !_dirty,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_busy) _confirmLeave();
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () {
              if (!_busy) _back();
            },
          ),
          title: Text(t.t('cases.bidForm.title')),
        ),
        body: ListView(
          padding: kDetailPadding,
          children: [
            WizardHeading(
              title: t.t('cases.bidForm.heading'),
              subtitle: t.t(
                assistant ? 'assistant.mode.noBids' : 'cases.bidForm.subtitle',
              ),
            ),
            if (!assistant) ConflictBanner(caseId: widget.caseId),
            if (_draftBy != null) ...[
              Container(
                key: const ValueKey('bid-draft-banner'),
                padding: const EdgeInsets.all(AppSpacing.md),
                margin: const EdgeInsets.only(bottom: AppSpacing.lg),
                decoration: BoxDecoration(
                  color: colors.iconTintFill,
                  borderRadius: BorderRadius.circular(AppRadii.field),
                  border: Border.all(color: colors.goldStroke),
                ),
                child: Row(
                  children: [
                    AppIcon(AppIcons.editNoteRounded, color: colors.iconTint),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        t.t('bidDraft.prepared', {'name': _draftBy!}),
                        style:
                            typography.bodySmall.copyWith(color: colors.text),
                      ),
                    ),
                  ],
                ),
              ),
            ],
            PayBlock(
              draft: _pay,
              rules: ContingencyRules.of(
                ref.watch(featureFlagsControllerProvider),
              ),
              richOn: richOn,
              percentAllowed: percentAllowed,
              enabled: !_busy,
              maxDollars: BidLimits.amountMaxDollars,
              onChanged: () => setState(() => _payTouched = true),
            ),
            const SizedBox(height: AppSpacing.lg),
            _FirmSender(
              caseId: widget.caseId,
              value: _sendAs,
              onChanged: (v) => setState(() => _sendAs = v),
            ),
            AppTextField(
              controller: _message,
              label: t.t('cases.bidForm.message'),
              hintText: t.t('cases.bidForm.messageHint'),
              maxLines: 6,
              maxLength: BidLimits.messageMax,
              textCapitalization: TextCapitalization.sentences,
              errorText: _message.text.isNotEmpty && !_messageOk
                  ? t.t('cases.bidForm.messageError', {
                      'min': '${BidLimits.messageMin}',
                    })
                  : null,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              t.t('cases.bidForm.start'),
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.sm,
              children: [
                for (final (s, key) in [
                  (StartAvailability.immediately, 'cases.start.immediately'),
                  (StartAvailability.withinWeek, 'cases.start.withinWeek'),
                  (StartAvailability.customDate, 'cases.start.pickDate'),
                ])
                  AppChip(
                    label:
                        s == StartAvailability.customDate && _startDate != null
                            ? formats.date(_startDate!)
                            : t.t(key),
                    selected: _start == s,
                    onTap: () {
                      if (s == StartAvailability.customDate) {
                        _pickDate();
                      } else {
                        setState(() => _start = s);
                      }
                    },
                  ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              controller: _duration,
              label: t.t('cases.bidForm.duration'),
              hintText: t.t('cases.bidForm.durationHint'),
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(4),
              ],
              errorText:
                  _durationOk ? null : t.t('cases.bidForm.durationError'),
              onChanged: (_) => setState(() {}),
            ),
            if (_error != null) ...[
              const SizedBox(height: AppSpacing.lg),
              Semantics(
                liveRegion: true,
                child: Text(
                  _error!,
                  style:
                      typography.bodySmall.copyWith(color: colors.dangerText),
                ),
              ),
            ],
          ],
        ),
        bottomNavigationBar: BottomActionBar(
          children: [
            if (assistant)
              AppButton(
                key: const ValueKey('bid-draft-save'),
                label: t.t('bidDraft.save'),
                icon: AppIcons.saveOutlined,
                isLoading: _busy,
                onPressed: _saveDraft,
              )
            else
              GavelStrikeButton(
                label: t.t('cases.bidForm.submit'),
                strike: true,
                isLoading: _busy,
                disabledHint: t.t('form.disabled.required'),
                isEnabled: _valid,
                onPressed: _submit,
              ),
          ],
        ),
      ),
    );
  }
}

enum _LeaveChoice { save, discard, stay }

/// R2-A #21: «Save draft?» with Save draft / Discard / Keep editing — the
/// look of the app's other leave sheets (create_case_screen.dart).
class _LeaveBidSheet extends StatelessWidget {
  const _LeaveBidSheet({required this.t});

  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          AppSpacing.lg,
        ),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              const SizedBox(height: AppSpacing.lg),
              Text(
                t.t('cases.bidForm.leave.title'),
                textAlign: TextAlign.center,
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                t.t('cases.bidForm.leave.body'),
                textAlign: TextAlign.center,
                style: typography.body.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                key: const ValueKey('bid-leave-save'),
                label: t.t('cases.bidForm.leave.save'),
                onPressed: () => Navigator.of(context).pop(_LeaveChoice.save),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                key: const ValueKey('bid-leave-discard'),
                label: t.t('cases.bidForm.leave.discard'),
                variant: AppButtonVariant.danger,
                onPressed: () =>
                    Navigator.of(context).pop(_LeaveChoice.discard),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                key: const ValueKey('bid-leave-stay'),
                label: t.t('cases.bidForm.leave.stay'),
                variant: AppButtonVariant.secondary,
                onPressed: () => Navigator.of(context).pop(_LeaveChoice.stay),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-14: the firm OWNER picks which lawyer of the firm (with a
/// matching verified licence) sends the bid.
///
/// R2-A #4 (what you see is what is sent): the field starts on me — the
/// sender of a bid nobody re-assigned — and is shown only to the firm's
/// owner, the one the server lets send as another member (R2B-1). Before,
/// when my licence did not fit the case, it showed the first lawyer while
/// the bid went out as me.
class _FirmSender extends ConsumerWidget {
  const _FirmSender({
    required this.caseId,
    required this.value,
    required this.onChanged,
  });

  final String caseId;
  final String? value;
  final ValueChanged<String?> onChanged;

  static String _name(String? first, String? last) =>
      [first, last].whereType<String>().join(' ').trim();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final me = ref.watch(sessionControllerProvider)?.sub;
    final fit = ref.watch(firmSendersProvider(caseId)).value ?? const [];
    final others = [
      for (final m in fit)
        if (m.attorneyId != me) m,
    ];
    // Only with someone else who fits is the firm read.
    final firm = others.isEmpty ? null : ref.watch(myFirmProvider).value;
    final owner = me != null && firm != null && firm.ownerId == me;
    if (!owner) {
      // Nothing to pick (any more): the bid is mine, whatever was chosen.
      if (value != null) {
        WidgetsBinding.instance.addPostFrameCallback((_) => onChanged(null));
      }
      return const SizedBox.shrink();
    }
    if (value != null && !others.any((m) => m.attorneyId == value)) {
      WidgetsBinding.instance.addPostFrameCallback((_) => onChanged(null));
    }
    api.FirmMemberDto? mine;
    for (final m in firm.members) {
      if (m.attorneyId == me) mine = m;
    }
    final myName = _name(mine?.firstName, mine?.lastName);
    final you = t.t('chat.you');
    final selected = others.any((m) => m.attorneyId == value) ? value! : me;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: DropdownButtonFormField<String>(
        key: const ValueKey('bid-send-as'),
        initialValue: selected,
        decoration: InputDecoration(labelText: t.t('firm.sendAs')),
        items: [
          DropdownMenuItem(
            value: me,
            child: Text(myName.isEmpty ? you : '$myName ($you)'),
          ),
          for (final m in others)
            DropdownMenuItem(
              value: m.attorneyId,
              child: Text(_name(m.firstName, m.lastName)),
            ),
        ],
        // Me = no «send as» at all: the bid is simply mine.
        onChanged: (v) => onChanged(v == me ? null : v),
      ),
    );
  }
}
