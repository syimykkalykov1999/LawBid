// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_country_partner_contract_dto.g.dart';

@JsonSerializable()
class UpdateCountryPartnerContractDto {
  const UpdateCountryPartnerContractDto({required this.text});

  factory UpdateCountryPartnerContractDto.fromJson(Map<String, Object?> json) =>
      _$UpdateCountryPartnerContractDtoFromJson(json);

  /// New text; saving makes a new version every partner accepts again.
  final String text;

  Map<String, Object?> toJson() =>
      _$UpdateCountryPartnerContractDtoToJson(this);
}
