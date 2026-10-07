import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/trust/application/trust_providers.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid/features/trust/presentation/trust_level_chip.dart';
import 'package:lawbid/features/trust/presentation/trust_links.dart';
import 'package:lawbid/features/trust/presentation/trust_signals_list.dart';
import 'package:lawbid/features/verification/presentation/widgets/inline_notice.dart';

/// Owner 2026-10-05 — «Мой уровень доверия» (`/trust/me`): the attorney's
/// level, holds (prominently), what each gate needs, payout delay, what is
/// confirmed, what raises the level next, the firm link with its
/// «Подтвердить по рабочей почте» form, and the registry links.
class MyTrustScreen extends ConsumerWidget {
  const MyTrustScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final async = ref.watch(myTrustProvider);

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('trust.me.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: async.when(
          loading: () =>
              Center(child: CircularProgressIndicator(color: colors.gold)),
          error: (e, _) => AppErrorState(
            message: errorText(t, e),
            retryLabel: t.t('error.retry'),
            onRetry: () => ref.invalidate(myTrustProvider),
          ),
          data: (me) => RefreshIndicator(
            color: colors.gold,
            onRefresh: () => ref.refresh(myTrustProvider.future),
            child: ListView(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              children: staggeredEntrance([
                _StatusCard(me: me, t: t),
                if (me.documentsRequested != null) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _DocumentsRequestedCard(me: me, t: t),
                ],
                if (me.onHold) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _HoldNotice(me: me, t: t),
                ],
                const SizedBox(height: AppSpacing.lg),
                _Header(me: me, t: t),
                const SizedBox(height: AppSpacing.lg),
                _SectionTitle(t.t('trust.me.gates')),
                _Gates(me: me, t: t),
                const SizedBox(height: AppSpacing.lg),
                _SectionTitle(t.t('trust.me.next')),
                _NextSteps(me: me, t: t),
                const SizedBox(height: AppSpacing.lg),
                _SectionTitle(t.t('trust.me.firm.title')),
                _FirmLinkCard(me: me, t: t),
                const SizedBox(height: AppSpacing.lg),
                _SectionTitle(t.t('trust.sheet.signals')),
                AppCard(
                  child: TrustSignalsList(trust: me.public, t: t, self: true),
                ),
                if (me.public.registryLinks.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.lg),
                  _SectionTitle(t.t('trust.me.registry')),
                  AppCard(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppSpacing.lg,
                      vertical: AppSpacing.xs,
                    ),
                    child: RegistryLinksList(
                      links: me.public.registryLinks,
                      t: t,
                    ),
                  ),
                ],
                const SizedBox(height: AppSpacing.xl),
              ]),
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.text);

  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(
        text,
        style: typography.roleTitle.copyWith(color: colors.text),
      ),
    );
  }
}

class _Header extends StatelessWidget {
  const _Header({required this.me, required this.t});

  final OwnTrust me;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final badgeText =
        t.t(me.public.badge ? 'trust.me.badge.on' : 'trust.me.badge.off');
    return AppCard(
      elevated: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(
                  t.t('trust.levelOf', {
                    'level': '${me.level}',
                    'max': '${TrustLevels.max}',
                  }),
                  style: typography.titleMedium.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              TrustLevelChip(level: me.level, compact: false),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            t.t('trust.me.intro'),
            style: typography.bodySmall
                .copyWith(color: colors.textSecondary, height: 1.35),
          ),
          const SizedBox(height: AppSpacing.md),
          TrustLevelLadder(level: me.level, t: t),
          const SizedBox(height: AppSpacing.sm),
          Row(
            children: [
              AppIcon(
                AppIcons.verifiedRounded,
                size: AppSizes.iconSm,
                color: me.public.badge ? colors.info : colors.textSecondary,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  badgeText,
                  style: typography.caption.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

/// Status first: «Проверка пройдена» / «На проверке у сотрудника» (what
/// waits) / «Заявлен — что осталось» (requirement rows with ticks) /
/// «Приостановлен».
class _StatusCard extends StatelessWidget {
  const _StatusCard({required this.me, required this.t});

  final OwnTrust me;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final status = me.staffStatus;
    final wire = switch (status) {
      TrustStaffStatus.cleared => 'cleared',
      TrustStaffStatus.needsStaff => 'needs_staff',
      TrustStaffStatus.suspended => 'suspended',
      TrustStaffStatus.selfDeclared => 'self_declared',
    };
    final (icon, fg, tone) = switch (status) {
      TrustStaffStatus.cleared => (
          AppIcons.verifiedRounded,
          colors.success,
          AppMedallionTone.success
        ),
      TrustStaffStatus.needsStaff => (
          AppIcons.hourglassTopRounded,
          colors.warning,
          AppMedallionTone.gold
        ),
      TrustStaffStatus.suspended => (
          AppIcons.pauseCircleOutlineRounded,
          colors.dangerText,
          AppMedallionTone.danger
        ),
      TrustStaffStatus.selfDeclared => (
          AppIcons.shieldOutlined,
          colors.textSecondary,
          AppMedallionTone.neutral
        ),
    };
    return AppCard(
      elevated: true,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIconMedallion(icon: icon, tone: tone),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Semantics(
                  header: true,
                  child: Text(
                    key: const ValueKey('trust-status-title'),
                    t.t('trust.me.status.$wire'),
                    style: typography.roleTitle.copyWith(color: fg),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            t.t('trust.me.status.$wire.body'),
            style:
                typography.bodySmall.copyWith(color: colors.text, height: 1.35),
          ),
          if (status == TrustStaffStatus.needsStaff) ...[
            const SizedBox(height: AppSpacing.xs),
            for (final w in waiting())
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.xs),
                child: Row(
                  children: [
                    AppIcon(
                      AppIcons.scheduleRounded,
                      size: AppSizes.iconSm,
                      color: colors.warning,
                    ),
                    const SizedBox(width: AppSpacing.sm),
                    Expanded(
                      child: Text(
                        t.t('trust.me.status.waiting.$w'),
                        style:
                            typography.bodySmall.copyWith(color: colors.text),
                      ),
                    ),
                  ],
                ),
              ),
          ],
          if (status == TrustStaffStatus.selfDeclared) ...[
            const SizedBox(height: AppSpacing.md),
            if (me.requirements.isEmpty)
              Text(
                t.t('trust.me.status.nothingMissing'),
                style: typography.caption.copyWith(color: colors.textSecondary),
              )
            else
              for (final r in TrustRequirement.values)
                if (me.requirements.contains(r))
                  _RequirementRow(requirement: r, done: me.met(r), t: t),
          ],
        ],
      ),
    );
  }

  /// What the staff decision waits on, from the holds, the firm link and
  /// the document request.
  List<String> waiting() {
    final out = <String>[];
    if (me.onHold) out.add('holds');
    if (me.firmLink.status == FirmLinkStatus.pending ||
        me.nextSteps.contains(TrustNextStep.firmLink.wire)) {
      out.add('firm_link');
    }
    if (me.documentsRequested != null ||
        me.missing.contains(TrustRequirement.documents)) {
      out.add('documents');
    }
    if (out.isEmpty) out.add('other');
    return out;
  }
}

class _RequirementRow extends StatelessWidget {
  const _RequirementRow({
    required this.requirement,
    required this.done,
    required this.t,
  });

  final TrustRequirement requirement;
  final bool done;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final fg = done ? colors.success : colors.textSecondary;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs + 2),
      child: Row(
        children: [
          AppIcon(
            done
                ? AppIcons.checkCircleRounded
                : AppIcons.radioButtonUncheckedRounded,
            size: AppSizes.iconSm,
            color: fg,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              key: ValueKey('trust-req-${requirement.wire}'),
              t.t(requirement.labelKey),
              style: typography.body.copyWith(color: colors.text),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          Text(
            t.t(done ? 'trust.req.done' : 'trust.req.missing'),
            style: typography.caption
                .copyWith(color: fg, fontWeight: FontWeight.w600),
          ),
        ],
      ),
    );
  }
}

/// «Сотрудник запросил документы»: the template sentence and a way to the
/// verification upload screen. The staff note of a `custom` request
/// travels in the notification, not in GET /trust/me.
class _DocumentsRequestedCard extends StatelessWidget {
  const _DocumentsRequestedCard({required this.me, required this.t});

  final OwnTrust me;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final template = me.documentsRequested;
    final body = template == 'custom'
        ? t.t('trust.docs.custom.noNote')
        : t.t(documentRequestTextKey(template));
    return InlineNotice(
      key: const ValueKey('trust-docs-requested'),
      tone: NoticeTone.warning,
      icon: AppIcons.uploadFileOutlined,
      title: t.t('trust.docs.title'),
      message: body,
      action: AppButton(
        label: t.t('trust.docs.cta'),
        icon: AppIcons.uploadFileOutlined,
        variant: AppButtonVariant.secondary,
        height: AppSizes.touchTarget,
        onPressed: () => context.push(AppRoutes.verification),
      ),
    );
  }
}

/// Payments / bids paused and why.
class _HoldNotice extends StatelessWidget {
  const _HoldNotice({required this.me, required this.t});

  final OwnTrust me;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final bids =
        !me.bidsGate.ok && me.bidsGate.reason != TrustGateReason.requirements;
    final pay = !me.paymentsGate.ok &&
        me.paymentsGate.reason != TrustGateReason.requirements;
    final gate = bids ? me.bidsGate : me.paymentsGate;
    final title = t.t(
      bids && pay
          ? 'trust.me.hold.both'
          : bids
              ? 'trust.me.hold.bids'
              : 'trust.me.hold.payments',
    );
    return InlineNotice(
      tone: NoticeTone.danger,
      icon: AppIcons.pauseCircleOutlineRounded,
      title: title,
      message: t.t(holdReasonKey(gate)),
    );
  }

  /// `trust.me.hold.reason.<code>` for a known hold code / suspension.
  static String holdReasonKey(TrustGate gate) {
    if (gate.reason == TrustGateReason.suspended) {
      return 'trust.me.hold.reason.suspended';
    }
    return switch (gate.hold) {
      'complaint' ||
      'name_mismatch' ||
      'duplicate_claim' ||
      'admin' =>
        'trust.me.hold.reason.${gate.hold}',
      _ => 'trust.me.hold.reason.other',
    };
  }
}

class _Gates extends StatelessWidget {
  const _Gates({required this.me, required this.t});

  final OwnTrust me;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final delay = me.payoutDelayDays;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _GateRow(
            icon: AppIcons.gavelOutlined,
            label: t.t('trust.me.gate.bids'),
            gate: me.bidsGate,
            t: t,
          ),
          const SizedBox(height: AppSpacing.md),
          _GateRow(
            icon: AppIcons.paymentsOutlined,
            label: t.t('trust.me.gate.payments'),
            gate: me.paymentsGate,
            t: t,
          ),
          if (delay != null && delay > 0) ...[
            const SizedBox(height: AppSpacing.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                AppIcon(
                  AppIcons.scheduleRounded,
                  size: AppSizes.iconSm,
                  color: colors.textSecondary,
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    t.t('trust.me.payoutDelay', {'days': '$delay'}),
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _GateRow extends StatelessWidget {
  const _GateRow({
    required this.icon,
    required this.label,
    required this.gate,
    required this.t,
  });

  final IconData icon;
  final String label;
  final TrustGate gate;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final status = gate.ok
        ? t.t('trust.me.gate.ok')
        : switch (gate.reason) {
            TrustGateReason.hold => t.t('trust.me.gate.hold'),
            TrustGateReason.suspended => t.t('trust.me.gate.suspended'),
            _ => t.t('trust.me.gate.requirements', {
                'missing': gate.missing.isEmpty
                    ? t.t('trust.me.status.waiting.other')
                    : gate.missing.map((m) => t.t(m.labelKey)).join(', '),
              }),
          };
    final fg = gate.ok
        ? colors.success
        : gate.reason == TrustGateReason.requirements
            ? colors.textSecondary
            : colors.dangerText;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        AppIcon(icon, size: AppSizes.iconSm, color: colors.goldDark),
        const SizedBox(width: AppSpacing.sm),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: typography.body.copyWith(color: colors.text)),
              Text(
                status,
                style: typography.caption
                    .copyWith(color: fg, fontWeight: FontWeight.w600),
              ),
            ],
          ),
        ),
        const SizedBox(width: AppSpacing.sm),
        AppIcon(
          gate.ok ? AppIcons.checkCircleRounded : AppIcons.cancelOutlined,
          size: AppSizes.iconSm,
          color: fg,
        ),
      ],
    );
  }
}

class _NextSteps extends StatelessWidget {
  const _NextSteps({required this.me, required this.t});

  final OwnTrust me;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    if (me.nextSteps.isEmpty) {
      return AppCard(
        child: Row(
          children: [
            AppIcon(
              AppIcons.taskAltRounded,
              size: AppSizes.iconSm,
              color: colors.success,
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Text(
                t.t('trust.me.next.done'),
                style: typography.bodySmall.copyWith(color: colors.text),
              ),
            ),
          ],
        ),
      );
    }
    final wantsDocuments = me.nextSteps.contains(TrustNextStep.documents.wire);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          for (final (i, step) in me.nextSteps.indexed) ...[
            if (i > 0) const SizedBox(height: AppSpacing.md),
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 22,
                  height: 22,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: colors.goldTint,
                    border: Border.all(color: colors.gold),
                  ),
                  child: Text(
                    '${i + 1}',
                    style: typography.caption.copyWith(
                      color: colors.goldDark,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Text(
                    key: ValueKey('trust-next-$step'),
                    t.t(trustNextStepTextKey(step)),
                    style: typography.bodySmall
                        .copyWith(color: colors.text, height: 1.35),
                  ),
                ),
              ],
            ),
          ],
          if (wantsDocuments) ...[
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              label: t.t('trust.next.documents.cta'),
              icon: AppIcons.uploadFileOutlined,
              variant: AppButtonVariant.secondary,
              height: AppSizes.touchTarget,
              onPressed: () => context.push(AppRoutes.verification),
            ),
          ],
        ],
      ),
    );
  }
}

class _FirmLinkCard extends StatelessWidget {
  const _FirmLinkCard({required this.me, required this.t});

  final OwnTrust me;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final link = me.firmLink;
    final statusText = t.t('trust.me.firm.${link.status.name}');
    final source = switch (link.source) {
      FirmLinkSource.registry => t.t('trust.me.firm.source.registry'),
      FirmLinkSource.email => t.t(
          'trust.me.firm.source.email',
          {'domain': link.emailDomain ?? ''},
        ),
      FirmLinkSource.staff => t.t('trust.me.firm.source.staff'),
      null => null,
    };
    final fg = switch (link.status) {
      FirmLinkStatus.confirmed => colors.success,
      FirmLinkStatus.pending => colors.warning,
      FirmLinkStatus.none => colors.textSecondary,
    };
    final showForm =
        me.needsFirmEmail && link.status != FirmLinkStatus.confirmed;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIcon(
                AppIcons.apartmentRounded,
                size: AppSizes.iconSm,
                color: colors.goldDark,
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  key: const ValueKey('trust-firm-status'),
                  source == null ? statusText : '$statusText · $source',
                  style: typography.bodySmall
                      .copyWith(color: fg, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ),
          // Admin «Вход и письма по почте» off (owner 2026-10-07): the code
          // could not be delivered — the link is confirmed by the registry
          // or by staff meanwhile.
          if (showForm)
            Consumer(
              builder: (context, ref, _) => ref.watch(emailFlowsEnabledProvider)
                  ? const Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        SizedBox(height: AppSpacing.lg),
                        _FirmEmailForm(),
                      ],
                    )
                  : const SizedBox.shrink(),
            ),
        ],
      ),
    );
  }
}

enum _FirmStage { email, code }

/// «Подтвердить по рабочей почте»: e-mail → `POST /trust/me/firm-email`
/// → 6-digit code → `POST /trust/me/firm-email/confirm` → success.
class _FirmEmailForm extends ConsumerStatefulWidget {
  const _FirmEmailForm();

  @override
  ConsumerState<_FirmEmailForm> createState() => _FirmEmailFormState();
}

class _FirmEmailFormState extends ConsumerState<_FirmEmailForm> {
  final _email = TextEditingController();
  var _stage = _FirmStage.email;
  var _busy = false;
  String? _error;
  String? _domain;
  String _code = '';

  static final _emailRe = RegExp(r'^[^@\s]+@[^@\s]+\.[^@\s]+$');

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    final email = _email.text.trim();
    if (!_emailRe.hasMatch(email)) {
      setState(() => _error = t.t('trust.me.firm.form.emailInvalid'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final domain =
          await ref.read(trustRepositoryProvider).requestFirmEmailCode(email);
      if (!mounted) return;
      setState(() {
        _domain = domain;
        _stage = _FirmStage.code;
        _code = '';
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _confirm() async {
    final t = ref.read(translatorProvider);
    if (_code.length != 6 || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final domain =
          await ref.read(trustRepositoryProvider).confirmFirmEmailCode(_code);
      if (!mounted) return;
      showAppSnackBar(
        context,
        t.t('trust.me.firm.form.success', {'domain': domain}),
      );
      ref.invalidate(myTrustProvider);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _error = errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          t.t('trust.me.firm.form.title'),
          style: typography.body
              .copyWith(color: colors.text, fontWeight: FontWeight.w600),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('trust.me.firm.form.hint'),
          style: typography.caption.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.md),
        switch (_stage) {
          _FirmStage.email => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AppTextField(
                  key: const ValueKey('trust-firm-email'),
                  controller: _email,
                  label: t.t('trust.me.firm.form.email'),
                  hintText: t.t('trust.me.firm.form.emailHint'),
                  errorText: _error,
                  keyboardType: TextInputType.emailAddress,
                  autofillHints: const [AutofillHints.email],
                  textInputAction: TextInputAction.done,
                  enabled: !_busy,
                  onChanged: (_) {
                    if (_error != null) setState(() => _error = null);
                  },
                  onSubmitted: (_) => _send(),
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  key: const ValueKey('trust-firm-send'),
                  label: t.t('trust.me.firm.form.send'),
                  icon: AppIcons.mailOutlineRounded,
                  height: AppSizes.touchTarget,
                  isLoading: _busy,
                  onPressed: _busy ? null : _send,
                ),
              ],
            ),
          _FirmStage.code => Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  t.t('trust.me.firm.form.sent', {'domain': _domain ?? ''}),
                  style: typography.bodySmall.copyWith(color: colors.text),
                ),
                const SizedBox(height: AppSpacing.md),
                Text(
                  t.t('trust.me.firm.form.code'),
                  style:
                      typography.caption.copyWith(color: colors.textSecondary),
                ),
                const SizedBox(height: AppSpacing.sm),
                AppOtpField(
                  key: const ValueKey('trust-firm-code'),
                  semanticLabel: t.t('trust.me.firm.form.codeLabel'),
                  errorText: _error,
                  onChanged: (v) => setState(() {
                    _code = v;
                    _error = null;
                  }),
                  onCompleted: (v) {
                    _code = v;
                    _confirm();
                  },
                ),
                const SizedBox(height: AppSpacing.md),
                AppButton(
                  key: const ValueKey('trust-firm-confirm'),
                  label: t.t('trust.me.firm.form.confirm'),
                  height: AppSizes.touchTarget,
                  isLoading: _busy,
                  disabledHint: t.t('form.disabled.code'),
                  isEnabled: _code.length == 6 && !_busy,
                  onPressed: _confirm,
                ),
                const SizedBox(height: AppSpacing.sm),
                AppButton(
                  label: t.t('trust.me.firm.form.changeEmail'),
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: _busy
                      ? null
                      : () => setState(() {
                            _stage = _FirmStage.email;
                            _error = null;
                            _code = '';
                          }),
                ),
              ],
            ),
        },
      ],
    );
  }
}
