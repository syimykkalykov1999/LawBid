// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bid_pack_buy_dto.g.dart';

@JsonSerializable()
class BidPackBuyDto {
  const BidPackBuyDto({required this.purchaseId, required this.checkoutUrl});

  factory BidPackBuyDto.fromJson(Map<String, Object?> json) =>
      _$BidPackBuyDtoFromJson(json);

  final String purchaseId;
  final String checkoutUrl;

  Map<String, Object?> toJson() => _$BidPackBuyDtoToJson(this);
}
