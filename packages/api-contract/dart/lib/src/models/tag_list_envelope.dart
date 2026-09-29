// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'tag_dto.dart';

part 'tag_list_envelope.g.dart';

@JsonSerializable()
class TagListEnvelope {
  const TagListEnvelope({required this.data, this.meta});

  factory TagListEnvelope.fromJson(Map<String, Object?> json) =>
      _$TagListEnvelopeFromJson(json);

  final List<TagDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$TagListEnvelopeToJson(this);
}
