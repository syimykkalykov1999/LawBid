import 'package:lawbid/features/onboarding/domain/us_states.dart';

/// A switched-on country (owner 2026-10-05: Admin → Система → Страны).
class CountryInfo {
  const CountryInfo({
    required this.code,
    required this.name,
    required this.callingCode,
    required this.regions,
  });

  final String code;
  final String name;

  /// Without "+".
  final String callingCode;
  final List<UsState> regions;
}

/// Countries the app works in and their regions (states, provinces), as
/// `GET /countries` returns them. Until that answers (or offline) it is
/// the USA, the launch country, from the bundled list.
abstract final class RegionCatalog {
  static const us = CountryInfo(
    code: 'US',
    name: 'United States',
    callingCode: '1',
    regions: kUsStates,
  );

  static List<CountryInfo> _countries = const [us];
  static List<UsState> _regions = kUsStates;

  static List<CountryInfo> get countries => _countries;

  /// Every region of every switched-on country, in the server's order.
  static List<UsState> get regions => _regions;

  static CountryInfo? country(String code) {
    for (final c in _countries) {
      if (c.code == code) return c;
    }
    return null;
  }

  static String? regionName(String code) {
    for (final r in _regions) {
      if (r.code == code) return r.name;
    }
    return null;
  }

  /// Replaces the catalog; an empty answer keeps the current one.
  static void replace(List<CountryInfo> countries) {
    if (countries.isEmpty) return;
    _countries = List.unmodifiable(countries);
    _regions = List.unmodifiable([
      for (final c in countries) ...c.regions,
    ]);
  }
}
