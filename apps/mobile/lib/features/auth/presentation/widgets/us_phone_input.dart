// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/onboarding/application/countries_providers.dart';
import 'package:lawbid/features/onboarding/domain/region_catalog.dart';

/// Phone helpers shared by the sign-in phone screen and the contacts
/// screens (docs/01_FOUNDATION_AUTH.md §10.2 C: "по умолчанию +1 США").
/// Owner 2026-10-05: any switched-on country works; +1 numbers keep the
/// `(XXX) XXX-XXXX` mask, others are plain digits. The backend still
/// refuses a country that is off (PHONE_COUNTRY_NOT_SUPPORTED).
abstract final class UsPhone {
  static const digitsLength = 10;

  /// E.164 allows 15 digits including the calling code.
  static const maxDigits = 14;

  static String digitsOf(String formatted) =>
      formatted.replaceAll(RegExp(r'\D'), '');

  static bool isValid(String formatted, {String callingCode = '1'}) {
    final n = digitsOf(formatted).length;
    if (callingCode == '1') return n == digitsLength;
    return n >= 4 && n + callingCode.length <= 15;
  }

  static String toE164(String formatted, {String callingCode = '1'}) =>
      '+$callingCode${digitsOf(formatted)}';

  /// The calling code of a switched-on country (the chip's pick).
  static String callingCodeFor(String countryCode) =>
      RegionCatalog.country(countryCode)?.callingCode ?? '1';

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

/// Country-code chip. One switched-on country: static
/// (`t('auth.phone.countryCode')` — "US +1"). Several: tap to pick one;
/// [onChanged] lets the field clear the number typed for another mask.
class CountryCodeChip extends ConsumerWidget {
  const CountryCodeChip({this.onChanged, super.key});

  final VoidCallback? onChanged;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final countries = RegionCatalog.countries;
    final picked = RegionCatalog.country(ref.watch(phoneCountryProvider));
    final single = countries.length <= 1 || picked == null;
    final label = single
        ? t.t('auth.phone.countryCode')
        : '${picked.code} +${picked.callingCode}';
    final chip = _chip(colors, typography, label);
    if (single) return ExcludeSemantics(child: chip);
    return Semantics(
      button: true,
      label: t.t('auth.phone.pickCountry'),
      value: label,
      excludeSemantics: true,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: () async {
          final code = await showAppBottomSheet<String>(
            context: context,
            isScrollControlled: true,
            builder: (ctx) => _CountrySheet(
              countries: countries,
              selected: picked.code,
              title: t.t('auth.phone.pickCountry'),
            ),
          );
          if (code == null || code == picked.code) return;
          ref.read(phoneCountryProvider.notifier).pick(code);
          onChanged?.call();
        },
        child: chip,
      ),
    );
  }

  Widget _chip(
    AppColorTokens colors,
    AppTypographyTokens typography,
    String label,
  ) {
    return Container(
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
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: typography.bodySmall.copyWith(color: colors.textSecondary),
            ),
          ),
          const SizedBox(width: 4),
          ChevronGlyph(
            direction: ChevronDirection.down,
            size: 15,
            color: colors.textSecondary,
          ),
        ],
      ),
    );
  }
}

class _CountrySheet extends StatelessWidget {
  const _CountrySheet({
    required this.countries,
    required this.selected,
    required this.title,
  });

  final List<CountryInfo> countries;
  final String selected;
  final String title;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(context).height * 0.7,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const AppSheetHandle(),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                8,
                AppSpacing.screenSide,
                8,
              ),
              child: Text(
                title,
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
            ),
            Flexible(
              child: ListView(
                shrinkWrap: true,
                children: [
                  for (final c in countries)
                    ListTile(
                      selected: c.code == selected,
                      title: Text(
                        c.name,
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                        style: typography.body.copyWith(color: colors.text),
                      ),
                      trailing: Text(
                        '+${c.callingCode}',
                        style: typography.body
                            .copyWith(color: colors.textSecondary),
                      ),
                      onTap: () => Navigator.of(context).pop(c.code),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Formats digits as `(XXX) XXX-XXXX` while typing, capped at 10 digits;
/// outside +1 ([nanp] false) it keeps plain digits.
class UsPhoneFormatter extends TextInputFormatter {
  UsPhoneFormatter({this.nanp = true});

  final bool nanp;

  @override
  TextEditingValue formatEditUpdate(
    TextEditingValue oldValue,
    TextEditingValue newValue,
  ) {
    if (!nanp) {
      var plain = UsPhone.digitsOf(newValue.text);
      if (plain.length > UsPhone.maxDigits) {
        plain = plain.substring(0, UsPhone.maxDigits);
      }
      return TextEditingValue(
        text: plain,
        selection: TextSelection.collapsed(offset: plain.length),
      );
    }
    var digits = UsPhone.digitsOf(newValue.text);
    // Backspace over a separator ("-", ") ", "(") removes no digit, so the
    // re-formatting would put it straight back and the cursor would stick.
    // Treat it as deleting the digit before it.
    if (newValue.text.length < oldValue.text.length &&
        digits == UsPhone.digitsOf(oldValue.text) &&
        digits.isNotEmpty) {
      digits = digits.substring(0, digits.length - 1);
    }
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
