// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_history_item_dto.dart';
import 'response_meta_dto.dart';

part 'case_history_item_list_envelope.g.dart';

@JsonSerializable()
class CaseHistoryItemListEnvelope {
  const CaseHistoryItemListEnvelope({required this.data, this.meta});

  factory CaseHistoryItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseHistoryItemListEnvelopeFromJson(json);

  final List<CaseHistoryItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseHistoryItemListEnvelopeToJson(this);
}
