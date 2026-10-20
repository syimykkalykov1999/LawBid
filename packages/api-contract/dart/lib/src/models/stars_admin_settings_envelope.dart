// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'stars_admin_settings_dto.dart';

part 'stars_admin_settings_envelope.g.dart';

@JsonSerializable()
class StarsAdminSettingsEnvelope {
  const StarsAdminSettingsEnvelope({required this.data, this.meta});

  factory StarsAdminSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$StarsAdminSettingsEnvelopeFromJson(json);

  final StarsAdminSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$StarsAdminSettingsEnvelopeToJson(this);
}
