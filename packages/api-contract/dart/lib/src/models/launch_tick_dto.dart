// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'launch_tick_dto.g.dart';

@JsonSerializable()
class LaunchTickDto {
  const LaunchTickDto({required this.done});

  factory LaunchTickDto.fromJson(Map<String, Object?> json) =>
      _$LaunchTickDtoFromJson(json);

  final bool done;

  Map<String, Object?> toJson() => _$LaunchTickDtoToJson(this);
}
