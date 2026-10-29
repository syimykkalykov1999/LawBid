// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'stars_purchase_dto_status.dart';

part 'stars_purchase_dto.g.dart';

@JsonSerializable()
class StarsPurchaseDto {
  const StarsPurchaseDto({
    required this.status,
    required this.stars,
    required this.balance,
  });
  
  factory StarsPurchaseDto.fromJson(Map<String, Object?> json) => _$StarsPurchaseDtoFromJson(json);
  
  final StarsPurchaseDtoStatus status;
  final int stars;
  final int balance;

  Map<String, Object?> toJson() => _$StarsPurchaseDtoToJson(this);
}
