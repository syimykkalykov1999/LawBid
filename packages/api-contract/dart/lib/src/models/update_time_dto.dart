// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'update_time_dto.g.dart';

@JsonSerializable()
class UpdateTimeDto {
  const UpdateTimeDto({
    this.minutes,
    this.workedOn,
    this.note,
  });
  
  factory UpdateTimeDto.fromJson(Map<String, Object?> json) => _$UpdateTimeDtoFromJson(json);
  
  final num? minutes;
  final DateTime? workedOn;
  final String? note;

  Map<String, Object?> toJson() => _$UpdateTimeDtoToJson(this);
}
