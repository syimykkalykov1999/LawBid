// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_pack_purchase_dto_status.dart';

part 'bid_pack_purchase_dto.g.dart';

@JsonSerializable()
class BidPackPurchaseDto {
  const BidPackPurchaseDto({
    required this.status,
    required this.bids,
    required this.balance,
  });

  factory BidPackPurchaseDto.fromJson(Map<String, Object?> json) =>
      _$BidPackPurchaseDtoFromJson(json);

  final BidPackPurchaseDtoStatus status;
  final int bids;
  final int balance;

  Map<String, Object?> toJson() => _$BidPackPurchaseDtoToJson(this);
}
