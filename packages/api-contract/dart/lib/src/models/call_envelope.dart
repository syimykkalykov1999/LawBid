// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'call_dto.dart';
import 'response_meta_dto.dart';

part 'call_envelope.g.dart';

@JsonSerializable()
class CallEnvelope {
  const CallEnvelope({required this.data, this.meta});

  factory CallEnvelope.fromJson(Map<String, Object?> json) =>
      _$CallEnvelopeFromJson(json);

  final CallDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CallEnvelopeToJson(this);
}
