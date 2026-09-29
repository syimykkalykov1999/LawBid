// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'read_notifications_result_dto.g.dart';

@JsonSerializable()
class ReadNotificationsResultDto {
  const ReadNotificationsResultDto({required this.updated});

  factory ReadNotificationsResultDto.fromJson(Map<String, Object?> json) =>
      _$ReadNotificationsResultDtoFromJson(json);

  final num updated;

  Map<String, Object?> toJson() => _$ReadNotificationsResultDtoToJson(this);
}
