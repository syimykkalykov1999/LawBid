// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'attorney_list_item_dto.dart';
import 'response_meta_dto.dart';

part 'attorney_list_item_list_envelope.g.dart';

@JsonSerializable()
class AttorneyListItemListEnvelope {
  const AttorneyListItemListEnvelope({required this.data, this.meta});

  factory AttorneyListItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$AttorneyListItemListEnvelopeFromJson(json);

  final List<AttorneyListItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$AttorneyListItemListEnvelopeToJson(this);
}
