// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'person_item_dto.dart';
import 'response_meta_dto.dart';

part 'person_item_list_envelope.g.dart';

@JsonSerializable()
class PersonItemListEnvelope {
  const PersonItemListEnvelope({required this.data, this.meta});

  factory PersonItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$PersonItemListEnvelopeFromJson(json);

  final List<PersonItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$PersonItemListEnvelopeToJson(this);
}
