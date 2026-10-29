// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'synonym_group_dto.dart';

part 'synonym_group_envelope.g.dart';

@JsonSerializable()
class SynonymGroupEnvelope {
  const SynonymGroupEnvelope({
    required this.data,
    this.meta,
  });
  
  factory SynonymGroupEnvelope.fromJson(Map<String, Object?> json) => _$SynonymGroupEnvelopeFromJson(json);
  
  final SynonymGroupDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SynonymGroupEnvelopeToJson(this);
}
