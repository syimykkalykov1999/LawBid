// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_case_state_dto.g.dart';

@JsonSerializable()
class AdminCaseStateDto {
  const AdminCaseStateDto({required this.code, required this.isPrimary});

  factory AdminCaseStateDto.fromJson(Map<String, Object?> json) =>
      _$AdminCaseStateDtoFromJson(json);

  final String code;
  final bool isPrimary;

  Map<String, Object?> toJson() => _$AdminCaseStateDtoToJson(this);
}
