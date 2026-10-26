// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'demo_current_dto.dart';
import 'response_meta_dto.dart';

part 'demo_current_envelope.g.dart';

@JsonSerializable()
class DemoCurrentEnvelope {
  const DemoCurrentEnvelope({required this.data, this.meta});

  factory DemoCurrentEnvelope.fromJson(Map<String, Object?> json) =>
      _$DemoCurrentEnvelopeFromJson(json);

  final DemoCurrentDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$DemoCurrentEnvelopeToJson(this);
}
