// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_user_case_dto.g.dart';

@JsonSerializable()
class AdminUserCaseDto {
  const AdminUserCaseDto({
    required this.id,
    required this.title,
    required this.status,
    required this.stateCode,
    required this.createdAt,
  });

  factory AdminUserCaseDto.fromJson(Map<String, Object?> json) =>
      _$AdminUserCaseDtoFromJson(json);

  final String id;
  final String title;
  final String status;
  final String stateCode;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminUserCaseDtoToJson(this);
}
