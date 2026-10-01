// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_step_up_result_dto.g.dart';

@JsonSerializable()
class AdminStepUpResultDto {
  const AdminStepUpResultDto({required this.validForSeconds});

  factory AdminStepUpResultDto.fromJson(Map<String, Object?> json) =>
      _$AdminStepUpResultDtoFromJson(json);

  final num validForSeconds;

  Map<String, Object?> toJson() => _$AdminStepUpResultDtoToJson(this);
}
