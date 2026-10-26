import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/time/resume_refresh_gate.dart';
import 'package:lawbid/features/case_payments/application/case_payments_providers.dart';
import 'package:lawbid/features/case_payments/domain/case_payment_models.dart';
import 'package:lawbid/features/case_payments/presentation/case_payment_widgets.dart';
import 'package:lawbid/features/case_payments/presentation/payment_request_sheet.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Owner 2026-10-05 — a thin bar above the chat composer of a case chat:
/// the client sees the attorney's open invoice(s) with «Оплатить» (two
/// taps to Stripe); the attorney gets «Выставить счёт». Nothing when the
/// flag is off, the attorney cannot receive, or there is nothing to show.
class ChatPaymentBar extends ConsumerStatefulWidget {
  const ChatPaymentBar({required this.caseId, super.key});

  final String caseId;

  @override
  ConsumerState<ChatPaymentBar> createState() => _ChatPaymentBarState();
}

class _ChatPaymentBarState extends ConsumerState<ChatPaymentBar>
    with WidgetsBindingObserver, ResumeRefreshGate {
  /// Silent in-flight guard: a double tap must not open two checkouts.
  bool _paying = false;

  String get caseId => widget.caseId;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Back from the external checkout: a paid invoice stops showing «Pay».
    if (resumeNeedsRefresh(state)) {
      ref.invalidate(casePaymentsStateProvider(caseId));
    }
  }

  Future<void> _pay(PaymentRequest first) async {
    if (_paying) return;
    _paying = true;
    final t = ref.read(translatorProvider);
    try {
      final start = await ref
          .read(casePaymentsRepositoryProvider)
          .payRequest(first);
      if (!mounted) return;
      expectExternalReturn();
      ref.invalidate(casePaymentsStateProvider(caseId));
      if (!await openCheckout(start.checkoutUrl) && mounted) {
        showAppSnackBar(context, t.t('plans.cantOpen'));
      }
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      _paying = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!ref.watch(casePaymentsFlagProvider)) return const SizedBox.shrink();
    final state = ref.watch(casePaymentsStateProvider(caseId)).value;
    if (state == null || !state.enabled) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    final open = state.openRequests;
    final payableNow = open.where((r) => r.canPay).toList();

    Widget? content;
    if (attorney && state.canRequest) {
      content = Row(
        children: [
          AppIcon(
            AppIcons.receiptLongOutlined,
            size: AppSizes.iconSm,
            color: colors.iconTint,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              open.isEmpty
                  ? t.t('cpay.req.title')
                  : t.t('cpay.req.open', {
                      'amount': f.currencyFromCents(state.openRequestsCents),
                    }),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.bodySmall.copyWith(color: colors.text),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppButton(
            label: t.t('cpay.chat.request'),
            variant: AppButtonVariant.secondary,
            onPressed: () => PaymentRequestSheet.show(
              context,
              caseId,
              state,
              onSent: () => ref.invalidate(casePaymentsStateProvider(caseId)),
            ),
          ),
        ],
      );
    } else if (!attorney && payableNow.isNotEmpty && state.canPay) {
      final first = payableNow.first;
      content = Row(
        children: [
          AppIcon(
            AppIcons.receiptLongOutlined,
            size: AppSizes.iconSm,
            color: colors.iconTint,
          ),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Text(
              open.length == 1
                  ? t.t('cpay.chat.payBar', {
                      'amount': f.currencyFromCents(first.amountCents),
                    })
                  : t.t('cpay.chat.payBarMany', {
                      'count': '${open.length}',
                      'amount': f.currencyFromCents(state.openRequestsCents),
                    }),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.bodySmall.copyWith(color: colors.text),
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          AppButton(
            label: t.t('cpay.req.payShort'),
            icon: AppIcons.lockOutlineRounded,
            onPressed: () => _pay(first),
          ),
        ],
      );
    }
    if (content == null) return const SizedBox.shrink();
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.sm,
      ),
      color: colors.goldTint,
      child: content,
    );
  }
}
