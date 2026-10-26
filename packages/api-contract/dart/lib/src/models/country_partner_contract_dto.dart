// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'country_partner_contract_dto.g.dart';

@JsonSerializable()
class CountryPartnerContractDto {
  const CountryPartnerContractDto({
    required this.version,
    required this.text,
    required this.updatedAt,
  });

  factory CountryPartnerContractDto.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerContractDtoFromJson(json);

  final int version;
  final String text;
  final DateTime? updatedAt;

  Map<String, Object?> toJson() => _$CountryPartnerContractDtoToJson(this);
}
