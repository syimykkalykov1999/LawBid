// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'partition_mode_dto_mode.dart';

part 'partition_mode_dto.g.dart';

@JsonSerializable()
class PartitionModeDto {
  const PartitionModeDto({required this.mode});

  factory PartitionModeDto.fromJson(Map<String, Object?> json) =>
      _$PartitionModeDtoFromJson(json);

  final PartitionModeDtoMode mode;

  Map<String, Object?> toJson() => _$PartitionModeDtoToJson(this);
}
