// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'assistant_me_dto.dart';
import 'response_meta_dto.dart';

part 'assistant_me_envelope.g.dart';

@JsonSerializable()
class AssistantMeEnvelope {
  const AssistantMeEnvelope({required this.data, this.meta});

  factory AssistantMeEnvelope.fromJson(Map<String, Object?> json) =>
      _$AssistantMeEnvelopeFromJson(json);

  final AssistantMeDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AssistantMeEnvelopeToJson(this);
}
