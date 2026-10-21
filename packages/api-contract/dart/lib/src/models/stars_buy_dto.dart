// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stars_buy_dto.g.dart';

@JsonSerializable()
class StarsBuyDto {
  const StarsBuyDto({required this.purchaseId, required this.checkoutUrl});

  factory StarsBuyDto.fromJson(Map<String, Object?> json) =>
      _$StarsBuyDtoFromJson(json);

  final String purchaseId;
  final String checkoutUrl;

  Map<String, Object?> toJson() => _$StarsBuyDtoToJson(this);
}
