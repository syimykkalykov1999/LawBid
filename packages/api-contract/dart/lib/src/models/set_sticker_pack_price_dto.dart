// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'set_sticker_pack_price_dto.g.dart';

@JsonSerializable()
class SetStickerPackPriceDto {
  const SetStickerPackPriceDto({required this.priceStars});

  factory SetStickerPackPriceDto.fromJson(Map<String, Object?> json) =>
      _$SetStickerPackPriceDtoFromJson(json);

  final int priceStars;

  Map<String, Object?> toJson() => _$SetStickerPackPriceDtoToJson(this);
}
