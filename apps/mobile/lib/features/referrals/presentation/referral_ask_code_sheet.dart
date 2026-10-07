import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/referrals/application/referrals_providers.dart';

/// Owner 2026-10-05 (docs/ops/demo-world.md): the one-time «Есть код
/// приглашения?» sheet after onboarding on iOS / without an install
/// referrer — a code field, «Применить» and «Пропустить». Dismissible.
class ReferralAskCodeSheet extends ConsumerStatefulWidget {
  const ReferralAskCodeSheet({super.key});

  static Future<void> show(BuildContext context) => showAppBottomSheet<void>(
        context: context,
        isScrollControlled: true,
        builder: (_) => const ReferralAskCodeSheet(),
      );

  @override
  ConsumerState<ReferralAskCodeSheet> createState() =>
      _ReferralAskCodeSheetState();
}

class _ReferralAskCodeSheetState extends ConsumerState<ReferralAskCodeSheet> {
  final _code = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _code.dispose();
    super.dispose();
  }

  Future<void> _apply() async {
    final code = _code.text.trim();
    if (code.isEmpty || _busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final t = ref.read(translatorProvider);
    try {
      await ref.read(referralsRepositoryProvider).apply(code);
      ref.invalidate(referralMeProvider);
      if (!mounted) return;
      Navigator.of(context).pop();
      showAppSnackBar(context, t.t('referral.autoApplied'));
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = switch (e) {
          ApiException(code: ApiErrorCodes.referralCodeInvalid) =>
            t.t('referral.apply.invalid'),
          ApiException(
            code: ApiErrorCodes.referralNotAllowed,
            :final details
          ) =>
            t.t('referral.apply.notAllowed.${details?['reason'] ?? 'other'}'),
          _ => errorText(t, e),
        };
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return SafeArea(
      top: false,
      child: Padding(
        padding: EdgeInsets.only(
          left: AppSpacing.screenSide,
          right: AppSpacing.screenSide,
          top: AppSpacing.md,
          bottom: AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            Semantics(
              header: true,
              child: Text(
                t.t('referral.askCode.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('referral.askCode.body'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppTextField(
              key: const ValueKey('referral-ask-code-field'),
              controller: _code,
              label: t.t('referral.askCode.field'),
              autofocus: true,
              enabled: !_busy,
              textCapitalization: TextCapitalization.characters,
              keyboardType: TextInputType.visiblePassword,
              inputFormatters: [
                FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9]')),
                LengthLimitingTextInputFormatter(24),
              ],
              leading: const AppIcon(AppIcons.giftOutlined),
              errorText: _error,
              textInputAction: TextInputAction.go,
              onSubmitted: (_) => _apply(),
              onChanged: (_) => setState(() => _error = null),
            ),
            const SizedBox(height: AppSpacing.lg),
            AppButton(
              key: const ValueKey('referral-ask-code-apply'),
              label: t.t('referral.askCode.apply'),
              isLoading: _busy,
              disabledHint: t.t('form.disabled.code'),
              isEnabled: _code.text.trim().isNotEmpty,
              onPressed: _apply,
            ),
            TextButton(
              key: const ValueKey('referral-ask-code-skip'),
              onPressed: _busy ? null : () => Navigator.of(context).pop(),
              child: Text(
                t.t('referral.askCode.skip'),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.body.copyWith(color: colors.textSecondary),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
