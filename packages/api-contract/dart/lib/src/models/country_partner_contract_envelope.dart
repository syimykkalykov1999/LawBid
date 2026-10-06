// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_contract_dto.dart';
import 'response_meta_dto.dart';

part 'country_partner_contract_envelope.g.dart';

@JsonSerializable()
class CountryPartnerContractEnvelope {
  const CountryPartnerContractEnvelope({required this.data, this.meta});

  factory CountryPartnerContractEnvelope.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerContractEnvelopeFromJson(json);

  final CountryPartnerContractDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CountryPartnerContractEnvelopeToJson(this);
}
