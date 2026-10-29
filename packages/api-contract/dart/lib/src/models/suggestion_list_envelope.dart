// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'suggestion_dto.dart';

part 'suggestion_list_envelope.g.dart';

@JsonSerializable()
class SuggestionListEnvelope {
  const SuggestionListEnvelope({
    required this.data,
    this.meta,
  });
  
  factory SuggestionListEnvelope.fromJson(Map<String, Object?> json) => _$SuggestionListEnvelopeFromJson(json);
  
  final List<SuggestionDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SuggestionListEnvelopeToJson(this);
}
