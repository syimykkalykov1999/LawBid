// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'saved_post_item_dto.dart';

part 'saved_post_item_list_envelope.g.dart';

@JsonSerializable()
class SavedPostItemListEnvelope {
  const SavedPostItemListEnvelope({required this.data, this.meta});

  factory SavedPostItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SavedPostItemListEnvelopeFromJson(json);

  final List<SavedPostItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SavedPostItemListEnvelopeToJson(this);
}
