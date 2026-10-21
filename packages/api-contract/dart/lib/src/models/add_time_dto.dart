// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'add_time_dto.g.dart';

@JsonSerializable()
class AddTimeDto {
  const AddTimeDto({required this.workedOn, required this.minutes, this.note});

  factory AddTimeDto.fromJson(Map<String, Object?> json) =>
      _$AddTimeDtoFromJson(json);

  final DateTime workedOn;
  final num minutes;
  final String? note;

  Map<String, Object?> toJson() => _$AddTimeDtoToJson(this);
}
