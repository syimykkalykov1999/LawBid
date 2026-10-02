// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';

/// US phone helpers shared by the sign-in phone screen and the onboarding
/// contacts step (docs/01_FOUNDATION_AUTH.md §10.2 C: "по умолчанию +1
/// США"). Only US numbers are supported in this pass; the backend rejects
/// other countries with PHONE_COUNTRY_NOT_SUPPORTED anyway (cost guard).
abstract final class UsPhone {
  static const digitsLength = 10;

  static String digitsOf(String formatted) =>
      formatted.replaceAll(RegExp(r'\D'), '');

  static bool isValid(String formatted) =>
      digitsOf(formatted).length == digitsLength;

  static String toE164(String formatted) => '+1${digitsOf(formatted)}';

  /// `+15551234567` → `(555) 123-4567`; anything else is returned as-is.
  static String format(String e164) {
    final digits = digitsOf(e164);
    final national = digits.length == 11 && digits.startsWith('1')
        ? digits.substring(1)
        : digits;
    if (national.length != digitsLength) return e164;
    return '(${national.substring(0, 3)}) ${national.substring(3, 6)}-${national.substring(6)}';
  }
}

/// Static country-code chip (`t('auth.phone.countryCode')` — "US +1").
class CountryCodeChip extends ConsumerWidget {
  const CountryCodeChip({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return ExcludeSemantics(
      child: Container(
        height: 32,
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: colors.bg,
          borderRadius: BorderRadius.circular(AppRadii.chip),
          border: Border.all(color: colors.border),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              t.t('auth.phone.countryCode'),
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(width: 4),
            ChevronGlyph(
              direction: ChevronDirection.down,
              size: 15,
              color: colors.textSecondary,
            ),
          ],
        ),
      ),
    );
  }
}

/// Formats digits as `(XXX) XXX-XXXX` while typing, capped at 10 digits.
class UsPhoneFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    final digits = UsPhone.digitsOf(newValue.text);
    final limited = digits.length > UsPhone.digitsLength
        ? digits.substring(0, UsPhone.digitsLength)
        : digits;

    final buffer = StringBuffer();
    if (limited.isNotEmpty) {
      buffer
        ..write('(')
        ..write(limited.substring(0, limited.length < 3 ? limited.length : 3));
    }
    if (limited.length >= 3) {
      buffer
        ..write(') ')
        ..write(limited.substring(3, limited.length < 6 ? limited.length : 6));
    }
    if (limited.length >= 6) {
      buffer
        ..write('-')
        ..write(limited.substring(6));
    }

    final formatted = buffer.toString();
    return TextEditingValue(
      text: formatted,
      selection: TextSelection.collapsed(offset: formatted.length),
    );
  }
}
