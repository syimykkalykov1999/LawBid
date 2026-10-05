// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'task_place_dto.g.dart';

@JsonSerializable()
class TaskPlaceDto {
  const TaskPlaceDto({required this.id, required this.address, this.label});

  factory TaskPlaceDto.fromJson(Map<String, Object?> json) =>
      _$TaskPlaceDtoFromJson(json);

  final String id;
  final String? label;
  final String address;

  Map<String, Object?> toJson() => _$TaskPlaceDtoToJson(this);
}
