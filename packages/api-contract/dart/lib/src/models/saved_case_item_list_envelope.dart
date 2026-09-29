// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'saved_case_item_dto.dart';

part 'saved_case_item_list_envelope.g.dart';

@JsonSerializable()
class SavedCaseItemListEnvelope {
  const SavedCaseItemListEnvelope({required this.data, this.meta});

  factory SavedCaseItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$SavedCaseItemListEnvelopeFromJson(json);

  final List<SavedCaseItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SavedCaseItemListEnvelopeToJson(this);
}
