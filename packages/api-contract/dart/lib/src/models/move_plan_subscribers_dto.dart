// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'move_plan_subscribers_dto.g.dart';

@JsonSerializable()
class MovePlanSubscribersDto {
  const MovePlanSubscribersDto({required this.reason});

  factory MovePlanSubscribersDto.fromJson(Map<String, Object?> json) =>
      _$MovePlanSubscribersDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$MovePlanSubscribersDtoToJson(this);
}
