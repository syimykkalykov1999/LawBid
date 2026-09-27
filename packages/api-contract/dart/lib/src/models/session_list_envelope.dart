// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'session_dto.dart';

part 'session_list_envelope.g.dart';

@JsonSerializable()
class SessionListEnvelope {
  const SessionListEnvelope({required this.data, this.meta});

  factory SessionListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SessionListEnvelopeFromJson(json);

  final List<SessionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SessionListEnvelopeToJson(this);
}
