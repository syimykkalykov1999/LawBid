// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_pack_purchase_dto.dart';
import 'response_meta_dto.dart';

part 'bid_pack_purchase_envelope.g.dart';

@JsonSerializable()
class BidPackPurchaseEnvelope {
  const BidPackPurchaseEnvelope({required this.data, this.meta});

  factory BidPackPurchaseEnvelope.fromJson(Map<String, Object?> json) =>
      _$BidPackPurchaseEnvelopeFromJson(json);

  final BidPackPurchaseDto data;
  final ResponseMetaDto? meta;

  Map<String, Object?> toJson() => _$BidPackPurchaseEnvelopeToJson(this);
}
