// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'status_result_dto_status.dart';

part 'status_result_dto.g.dart';

@JsonSerializable()
class StatusResultDto {
  const StatusResultDto({required this.status});

  factory StatusResultDto.fromJson(Map<String, Object?> json) =>
      _$StatusResultDtoFromJson(json);

  final StatusResultDtoStatus status;

  Map<String, Object?> toJson() => _$StatusResultDtoToJson(this);
}
