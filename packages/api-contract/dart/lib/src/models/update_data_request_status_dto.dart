// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_data_request_status_dto_status.dart';

part 'update_data_request_status_dto.g.dart';

@JsonSerializable()
class UpdateDataRequestStatusDto {
  const UpdateDataRequestStatusDto({required this.status, this.notes});

  factory UpdateDataRequestStatusDto.fromJson(Map<String, Object?> json) =>
      _$UpdateDataRequestStatusDtoFromJson(json);

  final UpdateDataRequestStatusDtoStatus status;
  final String? notes;

  Map<String, Object?> toJson() => _$UpdateDataRequestStatusDtoToJson(this);
}
