// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'bid_pack_dto.g.dart';

@JsonSerializable()
class BidPackDto {
  const BidPackDto({
    required this.id,
    required this.bids,
    required this.priceCents,
  });

  factory BidPackDto.fromJson(Map<String, Object?> json) =>
      _$BidPackDtoFromJson(json);

  final String id;
  final int bids;

  /// US cents
  final int priceCents;

  Map<String, Object?> toJson() => _$BidPackDtoToJson(this);
}
