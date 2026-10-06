// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'accept_country_partner_contract_dto.g.dart';

@JsonSerializable()
class AcceptCountryPartnerContractDto {
  const AcceptCountryPartnerContractDto({required this.version});

  factory AcceptCountryPartnerContractDto.fromJson(Map<String, Object?> json) =>
      _$AcceptCountryPartnerContractDtoFromJson(json);

  /// The version being accepted.
  final int version;

  Map<String, Object?> toJson() =>
      _$AcceptCountryPartnerContractDtoToJson(this);
}
