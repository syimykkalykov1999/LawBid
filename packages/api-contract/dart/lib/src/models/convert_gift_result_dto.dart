// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'convert_gift_result_dto.g.dart';

@JsonSerializable()
class ConvertGiftResultDto {
  const ConvertGiftResultDto({required this.stars, required this.balance});

  factory ConvertGiftResultDto.fromJson(Map<String, Object?> json) =>
      _$ConvertGiftResultDtoFromJson(json);

  final int stars;
  final int balance;

  Map<String, Object?> toJson() => _$ConvertGiftResultDtoToJson(this);
}
