// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'country_admin_dto.dart';
import 'response_meta_dto.dart';

part 'country_admin_envelope.g.dart';

@JsonSerializable()
class CountryAdminEnvelope {
  const CountryAdminEnvelope({required this.data, this.meta});

  factory CountryAdminEnvelope.fromJson(Map<String, Object?> json) =>
      _$CountryAdminEnvelopeFromJson(json);

  final CountryAdminDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CountryAdminEnvelopeToJson(this);
}
