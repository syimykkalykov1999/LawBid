// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'bid_pack_dto.dart';

part 'save_bid_packs_dto.g.dart';

@JsonSerializable()
class SaveBidPacksDto {
  const SaveBidPacksDto({required this.packs});

  factory SaveBidPacksDto.fromJson(Map<String, Object?> json) =>
      _$SaveBidPacksDtoFromJson(json);

  final List<BidPackDto> packs;

  Map<String, Object?> toJson() => _$SaveBidPacksDtoToJson(this);
}
