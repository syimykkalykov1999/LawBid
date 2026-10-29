// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'read_notifications_result_dto.g.dart';

@JsonSerializable()
class ReadNotificationsResultDto {
  const ReadNotificationsResultDto({
    required this.updated,
    this.readIds,
  });
  
  factory ReadNotificationsResultDto.fromJson(Map<String, Object?> json) => _$ReadNotificationsResultDtoFromJson(json);
  
  final num updated;

  /// Owner 2026-10-22 (package F): the ids that were unread and are read now — the app flips exactly those rows.
  final List<String>? readIds;

  Map<String, Object?> toJson() => _$ReadNotificationsResultDtoToJson(this);
}
