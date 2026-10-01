// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'assistant_request_dto.dart';
import 'response_meta_dto.dart';

part 'assistant_request_list_envelope.g.dart';

@JsonSerializable()
class AssistantRequestListEnvelope {
  const AssistantRequestListEnvelope({required this.data, this.meta});

  factory AssistantRequestListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AssistantRequestListEnvelopeFromJson(json);

  final List<AssistantRequestDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AssistantRequestListEnvelopeToJson(this);
}
