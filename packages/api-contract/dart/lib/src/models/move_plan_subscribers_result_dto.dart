// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'move_plan_subscribers_result_dto.g.dart';

@JsonSerializable()
class MovePlanSubscribersResultDto {
  const MovePlanSubscribersResultDto({
    required this.moved,
    required this.skipped,
    required this.failed,
  });

  factory MovePlanSubscribersResultDto.fromJson(Map<String, Object?> json) =>
      _$MovePlanSubscribersResultDtoFromJson(json);

  final int moved;

  /// Already on the price.
  final int skipped;
  final int failed;

  Map<String, Object?> toJson() => _$MovePlanSubscribersResultDtoToJson(this);
}
