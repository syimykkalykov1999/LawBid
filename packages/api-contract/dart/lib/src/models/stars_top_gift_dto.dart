// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stars_top_gift_dto.g.dart';

@JsonSerializable()
class StarsTopGiftDto {
  const StarsTopGiftDto({
    required this.title,
    required this.sent,
    required this.stars,
  });

  factory StarsTopGiftDto.fromJson(Map<String, Object?> json) =>
      _$StarsTopGiftDtoFromJson(json);

  final String title;
  final int sent;
  final int stars;

  Map<String, Object?> toJson() => _$StarsTopGiftDtoToJson(this);
}
