// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'strike_limit_dto_level.dart';

part 'strike_limit_dto.g.dart';

@JsonSerializable()
class StrikeLimitDto {
  const StrikeLimitDto({required this.level, required this.until});

  factory StrikeLimitDto.fromJson(Map<String, Object?> json) =>
      _$StrikeLimitDtoFromJson(json);

  final StrikeLimitDtoLevel level;
  final DateTime? until;

  Map<String, Object?> toJson() => _$StrikeLimitDtoToJson(this);
}
