import 'dart:ui';

import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Regions where the week starts on Sunday (CLDR) and on Saturday.
const _sundayRegions = {
  'AG', 'AS', 'AU', 'BD', 'BR', 'BS', 'BT', 'BW', 'BZ', 'CA', 'CO', 'DM',
  'DO', 'ET', 'GT', 'GU', 'HK', 'HN', 'ID', 'IL', 'IN', 'JM', 'JP', 'KE',
  'KH', 'KR', 'LA', 'MH', 'MM', 'MO', 'MT', 'MX', 'MZ', 'NI', 'NP', 'PA',
  'PE', 'PH', 'PK', 'PR', 'PT', 'PY', 'SA', 'SG', 'SV', 'TH', 'TT', 'TW',
  'UM', 'US', 'VE', 'VI', 'WS', 'YE', 'ZA', 'ZW', //
};
const _saturdayRegions = {
  'AE', 'AF', 'BH', 'DJ', 'DZ', 'EG', 'IQ', 'IR', 'JO', 'KW', 'LY', 'OM',
  'QA', 'SD', 'SY', //
};

/// The first day of the week for [locale] as `DateTime.monday` … `sunday`:
/// by the region (the device's, e.g. US → Sunday, RU → Monday), else by
/// the language when the region is unknown.
int firstWeekdayFor(Locale locale) {
  final region = locale.countryCode?.toUpperCase();
  if (region != null && region.isNotEmpty) {
    if (_sundayRegions.contains(region)) return DateTime.sunday;
    if (_saturdayRegions.contains(region)) return DateTime.saturday;
    return DateTime.monday;
  }
  return switch (locale.languageCode) {
    'en' ||
    'he' ||
    'ja' ||
    'ko' ||
    'th' ||
    'hi' ||
    'ne' ||
    'bn' ||
    'ur' =>
      DateTime.sunday,
    'ar' || 'fa' || 'ps' => DateTime.saturday,
    _ => DateTime.monday,
  };
}

/// The first day of the week for this device (overridable in tests).
final firstWeekdayProvider = Provider<int>(
  (ref) => firstWeekdayFor(PlatformDispatcher.instance.locale),
);

/// The first day of the week of the day [day] falls in (date only).
DateTime weekStartOf(DateTime day, int firstWeekday) {
  final d = DateTime(day.year, day.month, day.day);
  final back = (d.weekday - firstWeekday + 7) % 7;
  return DateTime(d.year, d.month, d.day - back);
}
