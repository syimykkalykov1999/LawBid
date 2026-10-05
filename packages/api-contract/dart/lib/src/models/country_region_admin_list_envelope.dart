// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_region_admin_dto.dart';
import 'response_meta_dto.dart';

part 'country_region_admin_list_envelope.g.dart';

@JsonSerializable()
class CountryRegionAdminListEnvelope {
  const CountryRegionAdminListEnvelope({required this.data, this.meta});

  factory CountryRegionAdminListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CountryRegionAdminListEnvelopeFromJson(json);

  final List<CountryRegionAdminDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CountryRegionAdminListEnvelopeToJson(this);
}
