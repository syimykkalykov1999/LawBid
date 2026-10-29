// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'partition_pause_dto.g.dart';

@JsonSerializable()
class PartitionPauseDto {
  const PartitionPauseDto({
    required this.paused,
  });
  
  factory PartitionPauseDto.fromJson(Map<String, Object?> json) => _$PartitionPauseDtoFromJson(json);
  
  final bool paused;

  Map<String, Object?> toJson() => _$PartitionPauseDtoToJson(this);
}
