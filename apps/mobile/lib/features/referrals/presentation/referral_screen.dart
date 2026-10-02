import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/referrals/application/referrals_providers.dart';
import 'package:lawbid/features/referrals/domain/referral_models.dart';
import 'package:lawbid/shared/presentation/share_sheet.dart';

/// What a reward is worth, in words ("$10 on your balance", "20% off the
/// first invoice", "3 days of promotion").
String rewardText(Translator t, L10nFormats f, Reward r) => switch (r.type) {
      RewardType.balanceCents => t.t(
          'referral.reward.balance',
          {'amount': f.currencyFromCents(r.value)},
        ),
      RewardType.percentFirstInvoice =>
        t.t('referral.reward.percent', {'percent': '${r.value}'}),
      RewardType.promotionDays =>
        t.t('referral.reward.days', {'days': '${r.value}'}),
      RewardType.unknown => '',
    };

/// Owner 2026-10-02 — Settings → Invite & earn: my code, share, what each
/// side gets, who joined; and entering someone else's code once.
class ReferralScreen extends ConsumerStatefulWidget {
  const ReferralScreen({this.initialCode, super.key});

  /// From an invite link: filled into the "have a code" field.
  final String? initialCode;

  @override
  ConsumerState<ReferralScreen> createState() => _ReferralScreenState();
}

class _ReferralScreenState extends ConsumerState<ReferralScreen> {
  late final _code = TextEditingController(text: widget.initialCode);
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  String _applyError(Translator t, Object e) {
    if (e is ApiException) {
      if (e.code == ApiErrorCodes.referralCodeInvalid) {
        return t.t('referral.apply.invalid');
      }
      if (e.code == ApiErrorCodes.referralNotAllowed) {
        final reason = e.details?['reason'];
        return t.t('referral.apply.notAllowed.${reason ?? 'other'}');
      }
    }
    return errorText(t, e);
  }

  Future<void> _apply() async {
    final code = _code.text.trim().toUpperCase();
    if (code.isEmpty || _busy) return;
    final t = ref.read(translatorProvider);
    final f = ref.read(l10nFormatsProvider);
    setState(() => _busy = true);
    try {
      final reward = await ref.read(referralsRepositoryProvider).apply(code);
      if (!mounted) return;
      _code.clear();
      showAppSnackBar(
        context,
        t.t('referral.apply.done', {'reward': rewardText(t, f, reward)}),
      );
      ref.invalidate(referralMeProvider);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, _applyError(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(referralMeProvider);

    Widget stat(String label, int n) => Expanded(
          child: Column(
            children: [
              Text(
                '$n',
                style: type.titleLarge.copyWith(color: colors.text),
              ),
              Text(
                label,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        );

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('referral.title')),
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
            onRetry: () => ref.invalidate(referralMeProvider),
          ),
          data: (me) {
            if (!me.enabled) {
              return AppEmptyState(
                icon: AppIcons.giftOutlined,
                title: t.t('referral.off.title'),
                message: t.t('referral.off.message'),
              );
            }
            return ListView(
              padding: const EdgeInsets.all(AppSpacing.screenSide),
              children: [
                Text(
                  t.t('referral.lead', {
                    'reward': rewardText(t, f, me.inviterReward),
                  }),
                  style: type.body.copyWith(color: colors.text, height: 1.4),
                ),
                const SizedBox(height: AppSpacing.lg),
                Container(
                  padding: const EdgeInsets.all(AppSpacing.lg),
                  decoration: BoxDecoration(
                    color: colors.goldTint,
                    borderRadius: BorderRadius.circular(AppRadii.card),
                    border: Border.all(color: colors.goldStroke),
                  ),
                  child: Column(
                    children: [
                      Text(
                        t.t('referral.yourCode'),
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      SelectableText(
                        me.code,
                        style: type.titleLarge.copyWith(
                          color: colors.goldDark,
                          letterSpacing: 3,
                        ),
                      ),
                      const SizedBox(height: AppSpacing.md),
                      Row(
                        children: [
                          Expanded(
                            child: AppButton(
                              label: t.t('referral.copy'),
                              variant: AppButtonVariant.secondary,
                              icon: AppIcons.linkRounded,
                              onPressed: () async {
                                await Clipboard.setData(
                                  ClipboardData(text: me.shareUrl),
                                );
                                if (context.mounted) {
                                  showAppSnackBar(
                                    context,
                                    t.t('referral.copied'),
                                  );
                                }
                              },
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: AppButton(
                              label: t.t('referral.share'),
                              icon: AppIcons.shareNetworkOutlined,
                              onPressed: () => showShareSheet(
                                context,
                                t: t,
                                link: me.shareUrl,
                                text: t.t('referral.shareText', {
                                  'code': me.code,
                                }),
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: AppSpacing.lg),
                Row(
                  children: [
                    stat(t.t('referral.stat.invited'), me.invited),
                    stat(t.t('referral.stat.qualified'), me.qualified),
                    stat(t.t('referral.stat.rewarded'), me.rewarded),
                  ],
                ),
                if (me.promotionCreditDays > 0 ||
                    me.pendingDiscountPercent > 0) ...[
                  const SizedBox(height: AppSpacing.lg),
                  Container(
                    padding: const EdgeInsets.all(AppSpacing.md),
                    decoration: BoxDecoration(
                      color: colors.surface,
                      borderRadius: BorderRadius.circular(AppRadii.card),
                      border: Border.all(color: colors.border),
                    ),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        if (me.pendingDiscountPercent > 0)
                          Text(
                            t.t('referral.pendingDiscount', {
                              'percent': '${me.pendingDiscountPercent}',
                            }),
                            style: type.body.copyWith(color: colors.text),
                          ),
                        if (me.promotionCreditDays > 0)
                          Text(
                            t.t('referral.credits', {
                              'days': '${me.promotionCreditDays}',
                            }),
                            style: type.body.copyWith(color: colors.text),
                          ),
                      ],
                    ),
                  ),
                ],
                if (me.invites.isNotEmpty) ...[
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    t.t('referral.invites'),
                    style: type.titleMedium.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  for (final i in me.invites)
                    ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: AppIcon(
                        i.refereeIsAttorney
                            ? AppIcons.gavelRounded
                            : AppIcons.personOutlineRounded,
                        color: colors.goldDark,
                      ),
                      title: Text(
                        t.t('referral.status.${i.status}'),
                        style: type.body.copyWith(color: colors.text),
                      ),
                      subtitle: Text(
                        '${f.date(i.createdAt)} · '
                        '${rewardText(t, f, i.reward)}',
                        style: type.caption.copyWith(
                          color: colors.textSecondary,
                        ),
                      ),
                    ),
                ],
                if (me.canApply) ...[
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    t.t('referral.haveCode'),
                    style: type.titleMedium.copyWith(color: colors.text),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    t.t('referral.haveCode.hint', {
                      'days': '${me.applyWindowDays}',
                    }),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      Expanded(
                        child: AppTextField(
                          controller: _code,
                          hintText: t.t('referral.codeHint'),
                          semanticLabel: t.t('referral.codeHint'),
                          textCapitalization: TextCapitalization.characters,
                          maxLength: 24,
                          onSubmitted: (_) => _apply(),
                        ),
                      ),
                      const SizedBox(width: AppSpacing.sm),
                      SizedBox(
                        width: 104,
                        child: AppButton(
                          label: t.t('referral.apply'),
                          variant: AppButtonVariant.secondary,
                          isLoading: _busy,
                          onPressed: _apply,
                        ),
                      ),
                    ],
                  ),
                ] else if (me.referredByStatus != null) ...[
                  const SizedBox(height: AppSpacing.xl),
                  Text(
                    t.t('referral.referredBy', {
                      'status': t.t('referral.status.${me.referredByStatus}'),
                    }),
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                ],
              ],
            );
          },
        ),
      ),
    );
  }
}
