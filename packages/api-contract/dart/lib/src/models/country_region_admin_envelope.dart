// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_region_admin_dto.dart';
import 'response_meta_dto.dart';

part 'country_region_admin_envelope.g.dart';

@JsonSerializable()
class CountryRegionAdminEnvelope {
  const CountryRegionAdminEnvelope({required this.data, this.meta});

  factory CountryRegionAdminEnvelope.fromJson(Map<String, Object?> json) =>
      _$CountryRegionAdminEnvelopeFromJson(json);

  final CountryRegionAdminDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CountryRegionAdminEnvelopeToJson(this);
}
