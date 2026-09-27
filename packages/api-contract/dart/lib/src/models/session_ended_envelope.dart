// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'session_ended_dto.dart';

part 'session_ended_envelope.g.dart';

@JsonSerializable()
class SessionEndedEnvelope {
  const SessionEndedEnvelope({required this.data, this.meta});

  factory SessionEndedEnvelope.fromJson(Map<String, Object?> json) =>
      _$SessionEndedEnvelopeFromJson(json);

  final SessionEndedDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SessionEndedEnvelopeToJson(this);
}
