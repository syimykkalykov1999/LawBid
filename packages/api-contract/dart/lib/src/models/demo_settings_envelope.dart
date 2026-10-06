// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_settings_dto.dart';
import 'response_meta_dto.dart';

part 'demo_settings_envelope.g.dart';

@JsonSerializable()
class DemoSettingsEnvelope {
  const DemoSettingsEnvelope({required this.data, this.meta});

  factory DemoSettingsEnvelope.fromJson(Map<String, Object?> json) =>
      _$DemoSettingsEnvelopeFromJson(json);

  final DemoSettingsDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DemoSettingsEnvelopeToJson(this);
}
