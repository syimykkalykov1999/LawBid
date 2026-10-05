// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partner_settings_dto.dart';
import 'response_meta_dto.dart';

part 'partner_settings_envelope.g.dart';

@JsonSerializable()
class PartnerSettingsEnvelope {
  const PartnerSettingsEnvelope({required this.data, this.meta});

  factory PartnerSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$PartnerSettingsEnvelopeFromJson(json);

  final PartnerSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PartnerSettingsEnvelopeToJson(this);
}
