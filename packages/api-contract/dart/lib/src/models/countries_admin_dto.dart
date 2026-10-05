// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_admin_dto.dart';

part 'countries_admin_dto.g.dart';

@JsonSerializable()
class CountriesAdminDto {
  const CountriesAdminDto({
    required this.countries,
    required this.notifyWaitlist,
    required this.canBulk,
  });

  factory CountriesAdminDto.fromJson(Map<String, Object?> json) =>
      _$CountriesAdminDtoFromJson(json);

  final List<CountryAdminDto> countries;

  /// E-mail the waiting list by itself when a country is switched on.
  final bool notifyWaitlist;

  /// The caller may use the master switch (owner only).
  final bool canBulk;

  Map<String, Object?> toJson() => _$CountriesAdminDtoToJson(this);
}
