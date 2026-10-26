// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_pack_dto.dart';

part 'bid_packs_dto.g.dart';

@JsonSerializable()
class BidPacksDto {
  const BidPacksDto({
    required this.enabled,
    required this.balance,
    required this.packs,
  });

  factory BidPacksDto.fromJson(Map<String, Object?> json) =>
      _$BidPacksDtoFromJson(json);

  final bool enabled;
  final int balance;
  final List<BidPackDto> packs;

  Map<String, Object?> toJson() => _$BidPacksDtoToJson(this);
}
