// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'task_place_input_dto.g.dart';

@JsonSerializable()
class TaskPlaceInputDto {
  const TaskPlaceInputDto({required this.address, this.label});

  factory TaskPlaceInputDto.fromJson(Map<String, Object?> json) =>
      _$TaskPlaceInputDtoFromJson(json);

  /// What the place is ("Court", "Client's home").
  final String? label;
  final String address;

  Map<String, Object?> toJson() => _$TaskPlaceInputDtoToJson(this);
}
