// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_status_dto.dart';
import 'response_meta_dto.dart';

part 'demo_status_envelope.g.dart';

@JsonSerializable()
class DemoStatusEnvelope {
  const DemoStatusEnvelope({required this.data, this.meta});

  factory DemoStatusEnvelope.fromJson(Map<String, Object?> json) =>
      _$DemoStatusEnvelopeFromJson(json);

  final DemoStatusDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DemoStatusEnvelopeToJson(this);
}
