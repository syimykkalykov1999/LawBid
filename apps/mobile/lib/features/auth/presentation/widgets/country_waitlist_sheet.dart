import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/auth/presentation/screens/email_screen.dart';
import 'package:lawbid/features/onboarding/application/countries_providers.dart';

/// Owner 2026-10-05: someone from a country LawBid is not open in yet
/// leaves an e-mail; the server writes once when the owner switches that
/// country on (Admin → Система → Страны, automatic by default).
Future<void> showCountryWaitlistSheet(
  BuildContext context, {
  required String countryCode,
}) {
  return showAppBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    builder: (_) => CountryWaitlistSheet(countryCode: countryCode),
  );
}

class CountryWaitlistSheet extends ConsumerStatefulWidget {
  const CountryWaitlistSheet({required this.countryCode, super.key});

  final String countryCode;

  @override
  ConsumerState<CountryWaitlistSheet> createState() =>
      _CountryWaitlistSheetState();
}

class _CountryWaitlistSheetState extends ConsumerState<CountryWaitlistSheet> {
  final _controller = TextEditingController();
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final t = ref.read(translatorProvider);
    final email = _controller.text.trim().toLowerCase();
    if (!isPlausibleEmail(email)) {
      setState(() => _error = t.t('auth.email.error.invalid'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final open = await joinCountryWaitlist(
        ref.read(dioProvider),
        countryCode: widget.countryCode,
        email: email,
        locale: Localizations.localeOf(context).languageCode,
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      showAppSnackBar(
        context,
        t.t(open ? 'auth.phone.waitlist.open' : 'auth.phone.waitlist.done'),
      );
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = false;
        _error = errorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return SafeArea(
      child: SingleChildScrollView(
        padding: EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          0,
          AppSpacing.screenSide,
          AppSpacing.lg + MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AppSheetHandle(),
            const SizedBox(height: AppSpacing.sm),
            Text(
              t.t('auth.phone.waitlist.title'),
              style: typography.titleMedium.copyWith(color: colors.text),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('auth.phone.waitlist.body'),
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              controller: _controller,
              hintText: t.t('auth.phone.waitlist.email'),
              semanticLabel: t.t('auth.phone.waitlist.email'),
              errorText: _error,
              keyboardType: TextInputType.emailAddress,
              autofocus: true,
              autofillHints: const [AutofillHints.email],
              onSubmitted: (_) => _submit(),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('auth.phone.waitlist.submit'),
              isLoading: _busy,
              onPressed: _busy ? null : _submit,
            ),
          ],
        ),
      ),
    );
  }
}
