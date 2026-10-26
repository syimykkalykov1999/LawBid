// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_calendar_connection_dto.g.dart';

@JsonSerializable()
class UpdateCalendarConnectionDto {
  const UpdateCalendarConnectionDto({this.readBusy, this.writeEvents});

  factory UpdateCalendarConnectionDto.fromJson(Map<String, Object?> json) =>
      _$UpdateCalendarConnectionDtoFromJson(json);

  final bool? readBusy;
  final bool? writeEvents;

  Map<String, Object?> toJson() => _$UpdateCalendarConnectionDtoToJson(this);
}
