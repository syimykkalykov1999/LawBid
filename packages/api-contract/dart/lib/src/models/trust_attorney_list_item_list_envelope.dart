// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'trust_attorney_list_item_dto.dart';

part 'trust_attorney_list_item_list_envelope.g.dart';

@JsonSerializable()
class TrustAttorneyListItemListEnvelope {
  const TrustAttorneyListItemListEnvelope({required this.data, this.meta});

  factory TrustAttorneyListItemListEnvelope.fromJson(
    Map<String, Object?> json,
  ) => _$TrustAttorneyListItemListEnvelopeFromJson(json);

  final List<TrustAttorneyListItemDto> data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() =>
      _$TrustAttorneyListItemListEnvelopeToJson(this);
}
