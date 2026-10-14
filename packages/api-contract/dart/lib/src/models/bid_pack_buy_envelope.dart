// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_pack_buy_dto.dart';
import 'response_meta_dto.dart';

part 'bid_pack_buy_envelope.g.dart';

@JsonSerializable()
class BidPackBuyEnvelope {
  const BidPackBuyEnvelope({required this.data, this.meta});

  factory BidPackBuyEnvelope.fromJson(Map<String, Object?> json) =>
      _$BidPackBuyEnvelopeFromJson(json);

  final BidPackBuyDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BidPackBuyEnvelopeToJson(this);
}
