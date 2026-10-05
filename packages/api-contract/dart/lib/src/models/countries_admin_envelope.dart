// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'countries_admin_dto.dart';
import 'response_meta_dto.dart';

part 'countries_admin_envelope.g.dart';

@JsonSerializable()
class CountriesAdminEnvelope {
  const CountriesAdminEnvelope({required this.data, this.meta});

  factory CountriesAdminEnvelope.fromJson(Map<String, Object?> json) =>
      _$CountriesAdminEnvelopeFromJson(json);

  final CountriesAdminDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CountriesAdminEnvelopeToJson(this);
}
