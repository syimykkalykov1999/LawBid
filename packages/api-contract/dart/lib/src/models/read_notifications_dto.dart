// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'read_notifications_dto.g.dart';

@JsonSerializable()
class ReadNotificationsDto {
  const ReadNotificationsDto({this.ids, this.all});

  factory ReadNotificationsDto.fromJson(Map<String, Object?> json) =>
      _$ReadNotificationsDtoFromJson(json);

  final List<String>? ids;

  /// "Отметить все как прочитанные".
  final bool? all;

  Map<String, Object?> toJson() => _$ReadNotificationsDtoToJson(this);
}
