import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/network/dio_client.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-05: the countries switched on in Admin → Система → Страны.
/// Loaded once at start-up into [RegionCatalog]; any failure keeps the
/// bundled USA so sign-up never breaks offline.
final countriesProvider = FutureProvider<List<CountryInfo>>((ref) async {
  try {
    final res =
        await api.CountriesClient(ref.watch(dioProvider)).listCountries();
    RegionCatalog.replace([
      for (final c in res.data)
        CountryInfo(
          code: c.code,
          name: c.name,
          callingCode: c.callingCode,
          regions: [for (final r in c.regions) UsState(r.code, r.name)],
        ),
    ]);
  } on Object {
    // keep what we have
  }
  return RegionCatalog.countries;
});

/// The country picked for the phone number (the code chip); the USA until
/// the person picks another switched-on country.
class PhoneCountry extends Notifier<String> {
  @override
  String build() => RegionCatalog.us.code;

  // A Notifier's state is set through a method, like the rest of the app.
  // ignore: use_setters_to_change_properties
  void pick(String code) => state = code;
}

final phoneCountryProvider =
    NotifierProvider<PhoneCountry, String>(PhoneCountry.new);

/// "Tell me when LawBid opens in my country." True = it is already open.
Future<bool> joinCountryWaitlist(
  Dio dio, {
  required String countryCode,
  required String email,
  String? locale,
}) async {
  final res = await api.CountriesClient(dio).joinCountryWaitlist(
    body: api.JoinCountryWaitlistDto(
      countryCode: countryCode,
      email: email,
      locale: locale,
    ),
  );
  return res.data.available;
}
