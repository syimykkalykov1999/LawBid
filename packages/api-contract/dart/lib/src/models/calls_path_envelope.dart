// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'calls_path_dto.dart';
import 'response_meta_dto.dart';

part 'calls_path_envelope.g.dart';

@JsonSerializable()
class CallsPathEnvelope {
  const CallsPathEnvelope({required this.data, this.meta});

  factory CallsPathEnvelope.fromJson(Map<String, Object?> json) =>
      _$CallsPathEnvelopeFromJson(json);

  final CallsPathDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CallsPathEnvelopeToJson(this);
}
