// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'synonym_test_dto.dart';

part 'synonym_test_envelope.g.dart';

@JsonSerializable()
class SynonymTestEnvelope {
  const SynonymTestEnvelope({
    required this.data,
    this.meta,
  });
  
  factory SynonymTestEnvelope.fromJson(Map<String, Object?> json) => _$SynonymTestEnvelopeFromJson(json);
  
  final SynonymTestDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SynonymTestEnvelopeToJson(this);
}
