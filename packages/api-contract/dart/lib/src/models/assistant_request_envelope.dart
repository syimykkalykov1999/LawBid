// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'assistant_request_dto.dart';
import 'response_meta_dto.dart';

part 'assistant_request_envelope.g.dart';

@JsonSerializable()
class AssistantRequestEnvelope {
  const AssistantRequestEnvelope({required this.data, this.meta});

  factory AssistantRequestEnvelope.fromJson(Map<String, Object?> json) =>
      _$AssistantRequestEnvelopeFromJson(json);

  final AssistantRequestDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AssistantRequestEnvelopeToJson(this);
}
