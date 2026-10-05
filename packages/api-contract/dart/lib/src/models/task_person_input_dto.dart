// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'task_person_input_dto.g.dart';

@JsonSerializable()
class TaskPersonInputDto {
  const TaskPersonInputDto({
    this.userId,
    this.name,
    this.role,
    this.phone,
    this.email,
  });

  factory TaskPersonInputDto.fromJson(Map<String, Object?> json) =>
      _$TaskPersonInputDtoFromJson(json);

  /// A person in the app.
  final String? userId;

  /// Required for an outside contact; app people get theirs.
  final String? name;

  /// "Witness", "Judge"…
  final String? role;
  final String? phone;
  final String? email;

  Map<String, Object?> toJson() => _$TaskPersonInputDtoToJson(this);
}
