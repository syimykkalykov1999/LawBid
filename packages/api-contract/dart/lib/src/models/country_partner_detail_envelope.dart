// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_detail_dto.dart';
import 'response_meta_dto.dart';

part 'country_partner_detail_envelope.g.dart';

@JsonSerializable()
class CountryPartnerDetailEnvelope {
  const CountryPartnerDetailEnvelope({required this.data, this.meta});

  factory CountryPartnerDetailEnvelope.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerDetailEnvelopeFromJson(json);

  final CountryPartnerDetailDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CountryPartnerDetailEnvelopeToJson(this);
}
