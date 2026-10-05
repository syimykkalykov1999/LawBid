// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_admin_countries_dto.g.dart';

@JsonSerializable()
class SetAdminCountriesDto {
  const SetAdminCountriesDto({required this.countries});

  factory SetAdminCountriesDto.fromJson(Map<String, Object?> json) =>
      _$SetAdminCountriesDtoFromJson(json);

  /// ISO 3166-1 alpha-2 codes; an empty list = every country. Applies at once.
  final List<String> countries;

  Map<String, Object?> toJson() => _$SetAdminCountriesDtoToJson(this);
}
