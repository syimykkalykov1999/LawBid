// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'stars_kind_total_dto.g.dart';

@JsonSerializable()
class StarsKindTotalDto {
  const StarsKindTotalDto({
    required this.kind,
    required this.stars,
    required this.count,
  });
  
  factory StarsKindTotalDto.fromJson(Map<String, Object?> json) => _$StarsKindTotalDtoFromJson(json);
  
  final String kind;
  final int stars;
  final int count;

  Map<String, Object?> toJson() => _$StarsKindTotalDtoToJson(this);
}
