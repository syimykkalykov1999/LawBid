// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'pin_post_dto.g.dart';

@JsonSerializable()
class PinPostDto {
  const PinPostDto({
    required this.slot,
  });
  
  factory PinPostDto.fromJson(Map<String, Object?> json) => _$PinPostDtoFromJson(json);
  
  final int slot;

  Map<String, Object?> toJson() => _$PinPostDtoToJson(this);
}
