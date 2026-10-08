import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/demo/application/demo_providers.dart';
import 'package:lawbid/features/demo/presentation/demo_section.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/consent_check_tile.dart';
import 'package:lawbid/features/partners/application/partners_providers.dart';
import 'package:lawbid/features/partners/domain/partner_models.dart';
import 'package:lawbid/features/partners/presentation/partner_terms_sheet.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';

/// Owner 2026-10-05 — Settings → Partner program: the partner's link, their
/// rates, who joined by the link (name, type, status), earnings held / to
/// be paid / paid, and every accrual.
class PartnerScreen extends ConsumerWidget {
  const PartnerScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(partnerMeProvider);

    // " (until 19 Oct)" after a held commission's status; empty otherwise.
    String holdText(PartnerCommission c) {
      if (c.status != 'held' || c.holdUntil == null) return '';
      final until = t.t('partner.holdUntil', {'date': f.date(c.holdUntil!)});
      return ' ($until)';
    }

    String roleText(ReferredUser r) => t.t(
          r.isAttorney
              ? 'partner.referred.attorney'
              : 'partner.referred.client',
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('partner.title')),
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
            onRetry: () => ref.invalidate(partnerMeProvider),
          ),
          data: (me) {
            if (!me.enabled) {
              return AppEmptyState(
                icon: AppIcons.handshakeOutlined,
                title: t.t('partner.disabled.title'),
                message: t.t('partner.disabled.message'),
              );
            }
            if (!me.isPartner) {
              if (!me.canJoin) {
                return AppEmptyState(
                  icon: AppIcons.handshakeOutlined,
                  title: t.t('partner.off.title'),
                  message: t.t('partner.off.message'),
                );
              }
              return _JoinIntro(me: me, t: t, f: f);
            }
            return RefreshIndicator(
              color: colors.gold,
              onRefresh: () {
                ref.invalidate(demoMeProvider);
                return ref.refresh(partnerMeProvider.future);
              },
              child: ListView(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                children: [
                  if (me.title.isNotEmpty) ...[
                    Text(
                      me.title,
                      style: type.titleMedium.copyWith(color: colors.text),
                    ),
                    const SizedBox(height: AppSpacing.xs),
                  ],
                  if (me.summary.isNotEmpty)
                    Text(
                      me.summary,
                      style:
                          type.body.copyWith(color: colors.text, height: 1.4),
                    ),
                  if (me.status == 'pending' ||
                      me.status == 'paused' ||
                      me.status == 'ended') ...[
                    const SizedBox(height: AppSpacing.md),
                    _Notice(
                      key: ValueKey('partner-status-${me.status}'),
                      text: t.t('partner.status.${me.status}'),
                    ),
                  ],
                  // Owner 2026-10-05 (legal): the FTC disclosure is always
                  // in sight for a partner.
                  if (me.disclosure.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.md),
                    _Notice(
                      key: const ValueKey('partner-disclosure'),
                      title: t.t('partner.disclosure.title'),
                      text: me.disclosure,
                    ),
                  ],
                  // Owner 2026-10-05 (legal): no link until the current
                  // rules are accepted (new version or an older partner).
                  if (me.needsTermsAcceptance) ...[
                    const SizedBox(height: AppSpacing.md),
                    _TermsPending(me: me, t: t),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  // A pending request has no working link yet.
                  if (!me.isPending && !me.needsTermsAcceptance) ...[
                    _LinkCard(me: me, t: t),
                    const SizedBox(height: AppSpacing.lg),
                    _Totals(totals: me.totals, t: t, f: f),
                    const SizedBox(height: AppSpacing.lg),
                    // Owner 2026-10-05: demo accounts for recording videos
                    // (renders nothing without the demo right).
                    const _DemoBlock(),
                  ],
                  _Rates(
                    rates: me.rates,
                    t: t,
                    f: f,
                    title: me.isPending ? t.t('partner.join.rates') : null,
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    t.t('partner.referred.title'),
                    style: type.titleMedium.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    me.referred.isEmpty
                        ? t.t('partner.referred.empty')
                        : t.t('partner.referred.count', {
                            'count': '${me.totals.referredCount}',
                            'qualified': '${me.totals.qualifiedCount}',
                          }),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  for (final r in me.referred)
                    ListTile(
                      key: ValueKey('partner-referred-${r.id}'),
                      contentPadding: EdgeInsets.zero,
                      leading: AppIcon(
                        r.isAttorney
                            ? AppIcons.gavelRounded
                            : AppIcons.personOutlineRounded,
                        color: colors.goldDark,
                      ),
                      title: Text(
                        r.name ?? t.t('partner.referred.anonymous'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(color: colors.text),
                      ),
                      subtitle: Text(
                        '${roleText(r)}'
                        ' · ${f.date(r.joinedAt)}'
                        ' · ${t.t('partner.referred.status.${r.status}')}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                      trailing: r.amountCents > 0
                          ? Text(
                              f.currencyFromCents(r.amountCents),
                              style: type.body.copyWith(
                                color: r.status == 'reversed'
                                    ? colors.textSecondary
                                    : colors.goldDark,
                                decoration: r.status == 'reversed'
                                    ? TextDecoration.lineThrough
                                    : null,
                              ),
                            )
                          : null,
                    ),
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    t.t('partner.commissions.title'),
                    style: type.titleMedium.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  if (me.commissions.isEmpty)
                    Text(
                      t.t('partner.commissions.empty'),
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  for (final c in me.commissions)
                    ListTile(
                      key: ValueKey('partner-commission-${c.id}'),
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        c.note != null &&
                                c.note!.isNotEmpty &&
                                c.kind == CommissionKind.adjustment
                            ? c.note!
                            : t.t('partner.kind.${c.kind.wire}'),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(color: colors.text),
                      ),
                      subtitle: Text(
                        '${f.date(c.createdAt)} · '
                        '${t.t('partner.cstatus.${c.status}')}'
                        '${holdText(c)}'
                        '${c.paidAt != null ? ' · ${f.date(c.paidAt!)}' : ''}',
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                      trailing: Text(
                        '${c.amountCents < 0 ? '−' : ''}'
                        '${f.currencyFromCents(c.amountCents.abs())}',
                        style: type.body.copyWith(
                          color: switch (c.status) {
                            'reversed' => colors.textSecondary,
                            _ when c.amountCents < 0 => colors.danger,
                            'paid' => colors.text,
                            _ => colors.goldDark,
                          },
                          decoration: c.status == 'reversed'
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                      ),
                    ),
                ],
              ),
            );
          },
        ),
      ),
    );
  }
}

/// `DemoSection` plus its bottom gap, both only when the section shows.
class _DemoBlock extends ConsumerWidget {
  const _DemoBlock();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final enabled = ref.watch(demoMeProvider).value?.enabled ?? false;
    if (!enabled) return const SizedBox.shrink();
    return const Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [DemoSection(), SizedBox(height: AppSpacing.xl)],
    );
  }
}

class _Notice extends StatelessWidget {
  const _Notice({required this.text, super.key, this.title, this.action});

  final String text;
  final String? title;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (title != null) ...[
            Text(
              title!,
              style: type.bodySmall.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
          ],
          Text(text, style: type.bodySmall.copyWith(color: colors.text)),
          if (action != null) ...[
            const SizedBox(height: AppSpacing.sm),
            action!,
          ],
        ],
      ),
    );
  }
}

/// Owner 2026-10-05 (legal): an existing partner who has not accepted the
/// current rules reads them in the sheet and accepts
/// (`POST /partners/me/accept-terms`); the link card stays hidden until then.
class _TermsPending extends ConsumerStatefulWidget {
  const _TermsPending({required this.me, required this.t});

  final PartnerMe me;
  final Translator t;

  @override
  ConsumerState<_TermsPending> createState() => _TermsPendingState();
}

class _TermsPendingState extends ConsumerState<_TermsPending> {
  bool _busy = false;

  Future<void> _open() async {
    final accepted = await showPartnerTermsSheet(
      context,
      t: widget.t,
      terms: widget.me.terms,
      withAccept: true,
    );
    if (accepted != true || !mounted || _busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(partnersRepositoryProvider).acceptTerms();
      if (!mounted) return;
      showAppSnackBar(context, widget.t.t('partner.terms.accepted'));
      ref.invalidate(partnerMeProvider);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, errorText(widget.t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return _Notice(
      key: const ValueKey('partner-terms-pending'),
      title: widget.t.t('partner.terms.title'),
      text: widget.t.t('partner.terms.pending'),
      action: AppButton(
        key: const ValueKey('partner-terms-open'),
        label: widget.t.t('partner.terms.open'),
        variant: AppButtonVariant.secondary,
        isLoading: _busy,
        onPressed: _open,
      ),
    );
  }
}

class _LinkCard extends StatelessWidget {
  const _LinkCard({required this.me, required this.t});

  final PartnerMe me;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Container(
      padding: const EdgeInsets.all(AppSpacing.lg),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.goldStroke),
      ),
      child: Column(
        children: [
          Text(
            t.t('partner.yourLink'),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.xs),
          SelectableText(
            me.code,
            style: type.titleLarge.copyWith(
              color: colors.goldDark,
              letterSpacing: 3,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            me.shareUrl,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  label: t.t('partner.copy'),
                  variant: AppButtonVariant.secondary,
                  icon: AppIcons.linkRounded,
                  onPressed: () async {
                    await Clipboard.setData(ClipboardData(text: me.shareUrl));
                    if (context.mounted) {
                      showAppSnackBar(context, t.t('partner.copied'));
                    }
                  },
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton(
                  label: t.t('partner.share'),
                  icon: AppIcons.shareNetworkOutlined,
                  onPressed: () => showShareSheet(
                    context,
                    t: t,
                    link: me.shareUrl,
                    text: t.t('partner.shareText', {'code': me.code}),
                  ),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _Totals extends StatelessWidget {
  const _Totals({required this.totals, required this.t, required this.f});

  final PartnerTotals totals;
  final Translator t;
  final L10nFormats f;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget cell(String label, int cents, {bool accent = false}) => Expanded(
          child: Column(
            children: [
              FittedBox(
                fit: BoxFit.scaleDown,
                child: Text(
                  f.currencyFromCents(cents),
                  style: type.titleMedium.copyWith(
                    color: accent ? colors.goldDark : colors.text,
                  ),
                ),
              ),
              Text(
                label,
                textAlign: TextAlign.center,
                maxLines: 2,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        );
    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Row(
        children: [
          cell(t.t('partner.totals.held'), totals.heldCents),
          cell(
            t.t('partner.totals.approved'),
            totals.approvedCents,
            accent: true,
          ),
          cell(t.t('partner.totals.paid'), totals.paidCents),
          cell(t.t('partner.totals.month'), totals.thisMonthCents),
        ],
      ),
    );
  }
}

/// Owner 2026-10-05: "в профилях тоже нужно сделать" — anyone the owner
/// allows reads what the program pays and joins with one tap; the link
/// appears right away.
class _JoinIntro extends ConsumerStatefulWidget {
  const _JoinIntro({required this.me, required this.t, required this.f});

  final PartnerMe me;
  final Translator t;
  final L10nFormats f;

  @override
  ConsumerState<_JoinIntro> createState() => _JoinIntroState();
}

class _JoinIntroState extends ConsumerState<_JoinIntro> {
  bool _busy = false;

  /// Owner 2026-10-05 (legal): the rules must be accepted before joining.
  bool _termsAccepted = false;

  Future<void> _openTerms() => showPartnerTermsSheet(
        context,
        t: widget.t,
        terms: widget.me.terms,
      );

  Future<void> _join() async {
    if (_busy) return;
    if (!_termsAccepted) {
      showAppSnackBar(context, widget.t.t('partner.terms.required'));
      return;
    }
    setState(() => _busy = true);
    try {
      final after = await ref
          .read(partnersRepositoryProvider)
          .join(termsAccepted: _termsAccepted);
      if (!mounted) return;
      showAppSnackBar(
        context,
        widget.t.t(
          after.isPending ? 'partner.join.sent' : 'partner.join.done',
        ),
      );
      ref.invalidate(partnerMeProvider);
    } catch (e) {
      if (!mounted) return;
      showAppSnackBar(context, errorText(widget.t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final me = widget.me;
    final t = widget.t;
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenSide),
      children: [
        if (me.title.isNotEmpty) ...[
          Text(
            me.title,
            style: type.titleMedium.copyWith(color: colors.text),
          ),
          const SizedBox(height: AppSpacing.xs),
        ],
        if (me.summary.isNotEmpty)
          Text(
            me.summary,
            style: type.body.copyWith(color: colors.text, height: 1.4),
          ),
        const SizedBox(height: AppSpacing.lg),
        _Rates(
          rates: me.rates,
          t: t,
          f: widget.f,
          title: t.t('partner.join.rates'),
        ),
        const SizedBox(height: AppSpacing.xl),
        if (me.disclosure.isNotEmpty) ...[
          _Notice(
            key: const ValueKey('partner-disclosure'),
            title: t.t('partner.disclosure.title'),
            text: me.disclosure,
          ),
          const SizedBox(height: AppSpacing.md),
        ],
        ConsentCheckTile(
          key: const ValueKey('partner-terms-checkbox'),
          value: _termsAccepted,
          onChanged: (v) => setState(() => _termsAccepted = v),
          semanticLabel: t.t('partner.terms.checkbox'),
          // The label itself opens the rules; the box toggles.
          content: GestureDetector(
            onTap: _openTerms,
            child: Text(
              t.t('partner.terms.checkbox'),
              style: type.bodySmall.copyWith(
                color: colors.text,
                decoration: TextDecoration.underline,
              ),
            ),
          ),
        ),
        Align(
          alignment: AlignmentDirectional.centerStart,
          child: TextButton(
            key: const ValueKey('partner-terms-open'),
            onPressed: _openTerms,
            child: Text(
              t.t('partner.terms.open'),
              style: type.bodySmall.copyWith(
                color: colors.goldDark,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        AppButton(
          key: const ValueKey('partner-join'),
          label: t.t('partner.join.button'),
          isLoading: _busy,
          disabledHint: t.t('form.disabled.accept'),
          isEnabled: _termsAccepted,
          onPressed: _termsAccepted ? _join : null,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          t.t(
            me.joinMode == 'approval'
                ? 'partner.join.note.approval'
                : 'partner.join.note',
          ),
          style: type.caption.copyWith(color: colors.textSecondary),
        ),
      ],
    );
  }
}

class _Rates extends StatelessWidget {
  const _Rates({
    required this.rates,
    required this.t,
    required this.f,
    this.title,
  });

  final PartnerRates rates;
  final Translator t;
  final L10nFormats f;
  final String? title;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    Widget row(String label, int cents) => Padding(
          padding: const EdgeInsets.only(top: AppSpacing.xs),
          child: Row(
            children: [
              Expanded(
                child: Text(
                  label,
                  style: type.bodySmall.copyWith(color: colors.text),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Text(
                f.currencyFromCents(cents),
                style: type.bodySmall.copyWith(color: colors.goldDark),
              ),
            ],
          ),
        );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title ?? t.t('partner.rates.title'),
          style: type.titleMedium.copyWith(color: colors.text),
        ),
        if (rates.attorneyRateCents > 0)
          row(t.t('partner.rates.attorney'), rates.attorneyRateCents),
        if (rates.clientRateCents > 0)
          row(
            t.t('partner.rates.client.${rates.clientRule}'),
            rates.clientRateCents,
          ),
        if (rates.monthlyBaseCents > 0)
          row(t.t('partner.rates.monthly'), rates.monthlyBaseCents),
        if (rates.holdDays > 0) ...[
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('partner.rates.hold', {'days': '${rates.holdDays}'}),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ],
    );
  }
}
