// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_bid_item_dto.dart';
import 'response_meta_dto.dart';

part 'case_bid_item_list_envelope.g.dart';

@JsonSerializable()
class CaseBidItemListEnvelope {
  const CaseBidItemListEnvelope({required this.data, this.meta});

  factory CaseBidItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseBidItemListEnvelopeFromJson(json);

  final List<CaseBidItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseBidItemListEnvelopeToJson(this);
}
