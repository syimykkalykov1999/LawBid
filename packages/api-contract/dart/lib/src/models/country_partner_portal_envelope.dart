// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_partner_portal_dto.dart';
import 'response_meta_dto.dart';

part 'country_partner_portal_envelope.g.dart';

@JsonSerializable()
class CountryPartnerPortalEnvelope {
  const CountryPartnerPortalEnvelope({required this.data, this.meta});

  factory CountryPartnerPortalEnvelope.fromJson(Map<String, Object?> json) =>
      _$CountryPartnerPortalEnvelopeFromJson(json);

  final CountryPartnerPortalDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CountryPartnerPortalEnvelopeToJson(this);
}
