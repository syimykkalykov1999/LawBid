// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'case_feed_item_dto.dart';
import 'response_meta_dto.dart';

part 'case_feed_item_list_envelope.g.dart';

@JsonSerializable()
class CaseFeedItemListEnvelope {
  const CaseFeedItemListEnvelope({required this.data, this.meta});

  factory CaseFeedItemListEnvelope.fromJson(Map<String, Object?> json) =>
      _$CaseFeedItemListEnvelopeFromJson(json);

  final List<CaseFeedItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$CaseFeedItemListEnvelopeToJson(this);
}
