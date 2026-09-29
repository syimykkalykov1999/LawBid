// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'my_bid_item_dto.dart';
import 'response_meta_dto.dart';

part 'my_bid_item_list_envelope.g.dart';

@JsonSerializable()
class MyBidItemListEnvelope {
  const MyBidItemListEnvelope({required this.data, this.meta});

  factory MyBidItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$MyBidItemListEnvelopeFromJson(json);

  final List<MyBidItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$MyBidItemListEnvelopeToJson(this);
}
