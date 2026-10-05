// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'system_health_dto.dart';

part 'system_health_envelope.g.dart';

@JsonSerializable()
class SystemHealthEnvelope {
  const SystemHealthEnvelope({required this.data, this.meta});

  factory SystemHealthEnvelope.fromJson(Map<String, Object?> json) =>
      _$SystemHealthEnvelopeFromJson(json);

  final SystemHealthDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SystemHealthEnvelopeToJson(this);
}
