// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'armed_reminders_dto.g.dart';

@JsonSerializable()
class ArmedRemindersDto {
  const ArmedRemindersDto({required this.token, required this.ids});

  factory ArmedRemindersDto.fromJson(Map<String, Object?> json) =>
      _$ArmedRemindersDtoFromJson(json);

  /// FCM registration token of this device.
  final String token;

  /// `<taskId>@<remindAt ms>` of each armed reminder.
  final List<String> ids;

  Map<String, Object?> toJson() => _$ArmedRemindersDtoToJson(this);
}
