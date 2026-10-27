// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'team_release_result_dto.g.dart';

@JsonSerializable()
class TeamReleaseResultDto {
  const TeamReleaseResultDto({required this.released});

  factory TeamReleaseResultDto.fromJson(Map<String, Object?> json) =>
      _$TeamReleaseResultDtoFromJson(json);

  /// How many items went back to the queue.
  final num released;

  Map<String, Object?> toJson() => _$TeamReleaseResultDtoToJson(this);
}
