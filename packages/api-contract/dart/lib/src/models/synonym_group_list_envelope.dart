// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'synonym_group_dto.dart';

part 'synonym_group_list_envelope.g.dart';

@JsonSerializable()
class SynonymGroupListEnvelope {
  const SynonymGroupListEnvelope({required this.data, this.meta});

  factory SynonymGroupListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SynonymGroupListEnvelopeFromJson(json);

  final List<SynonymGroupDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SynonymGroupListEnvelopeToJson(this);
}
