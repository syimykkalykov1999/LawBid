// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'response_meta_dto.dart';
import 'save_bid_packs_dto.dart';

part 'save_bid_packs_envelope.g.dart';

@JsonSerializable()
class SaveBidPacksEnvelope {
  const SaveBidPacksEnvelope({required this.data, this.meta});

  factory SaveBidPacksEnvelope.fromJson(Map<String, Object?> json) =>
      _$SaveBidPacksEnvelopeFromJson(json);

  final SaveBidPacksDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$SaveBidPacksEnvelopeToJson(this);
}
