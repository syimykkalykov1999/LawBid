// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_case_action_dto.g.dart';

@JsonSerializable()
class AdminCaseActionDto {
  const AdminCaseActionDto({required this.reason});

  factory AdminCaseActionDto.fromJson(Map<String, Object?> json) =>
      _$AdminCaseActionDtoFromJson(json);

  final String reason;

  Map<String, Object?> toJson() => _$AdminCaseActionDtoToJson(this);
}
