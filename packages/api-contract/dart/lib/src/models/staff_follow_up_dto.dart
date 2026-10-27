// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'staff_follow_up_dto_target.dart';

part 'staff_follow_up_dto.g.dart';

@JsonSerializable()
class StaffFollowUpDto {
  const StaffFollowUpDto({
    required this.call,
    required this.target,
    required this.applied,
  });

  factory StaffFollowUpDto.fromJson(Map<String, Object?> json) =>
      _$StaffFollowUpDtoFromJson(json);

  /// The existing admin-management call the decision asks for (by name).
  final String call;
  final StaffFollowUpDtoTarget target;

  /// false = not run yet (the owner presses it in the admin list); true = run by the server.
  final bool applied;

  Map<String, Object?> toJson() => _$StaffFollowUpDtoToJson(this);
}
