// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'trust_level_count_dto.g.dart';

@JsonSerializable()
class TrustLevelCountDto {
  const TrustLevelCountDto({required this.level, required this.attorneys});

  factory TrustLevelCountDto.fromJson(Map<String, Object?> json) =>
      _$TrustLevelCountDtoFromJson(json);

  final int level;
  final int attorneys;

  Map<String, Object?> toJson() => _$TrustLevelCountDtoToJson(this);
}
