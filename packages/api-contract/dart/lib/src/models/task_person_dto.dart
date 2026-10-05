// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'task_person_dto_user_role.dart';

part 'task_person_dto.g.dart';

@JsonSerializable()
class TaskPersonDto {
  const TaskPersonDto({
    required this.id,
    required this.name,
    this.userId,
    this.userRole,
    this.avatarUrl,
    this.role,
    this.phone,
    this.email,
  });

  factory TaskPersonDto.fromJson(Map<String, Object?> json) =>
      _$TaskPersonDtoFromJson(json);

  final String id;
  final String? userId;

  /// Who the app person is (null: an outside contact).
  final TaskPersonDtoUserRole? userRole;
  final String? avatarUrl;
  final String name;
  final String? role;
  final String? phone;
  final String? email;

  Map<String, Object?> toJson() => _$TaskPersonDtoToJson(this);
}
