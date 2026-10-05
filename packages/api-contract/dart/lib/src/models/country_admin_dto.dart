// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'country_admin_dto.g.dart';

@JsonSerializable()
class CountryAdminDto {
  const CountryAdminDto({
    required this.code,
    required this.name,
    required this.isEnabled,
    required this.callingCode,
    required this.currency,
    required this.language,
    required this.regionKind,
    required this.timezone,
    required this.stripeSupported,
    required this.sort,
    required this.enabledAt,
    required this.regions,
    required this.clients,
    required this.attorneys,
    required this.waiting,
    required this.ready,
  });

  factory CountryAdminDto.fromJson(Map<String, Object?> json) =>
      _$CountryAdminDtoFromJson(json);

  final String code;
  final String name;
  final bool isEnabled;
  final String callingCode;
  final String currency;
  final String language;
  final String regionKind;
  final String? timezone;
  final bool stripeSupported;
  final int sort;
  final DateTime? enabledAt;

  /// Active regions.
  final int regions;
  final int clients;
  final int attorneys;

  /// People waiting to be told it is open.
  final int waiting;

  /// Can be switched on: it has regions (states/provinces) to pick.
  final bool ready;

  Map<String, Object?> toJson() => _$CountryAdminDtoToJson(this);
}
