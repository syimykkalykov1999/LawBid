// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_counters_dto.g.dart';

@JsonSerializable()
class PostCountersDto {
  const PostCountersDto({
    this.hideLikes,
    this.hideViews,
  });
  
  factory PostCountersDto.fromJson(Map<String, Object?> json) => _$PostCountersDtoFromJson(json);
  
  final bool? hideLikes;
  final bool? hideViews;

  Map<String, Object?> toJson() => _$PostCountersDtoToJson(this);
}
