// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'task_person_suggestion_dto_source.dart';

part 'task_person_suggestion_dto.g.dart';

@JsonSerializable()
class TaskPersonSuggestionDto {
  const TaskPersonSuggestionDto({
    required this.source,
    required this.name,
    this.userId,
    this.membershipId,
    this.avatarUrl,
    this.role,
    this.phone,
    this.email,
  });

  factory TaskPersonSuggestionDto.fromJson(Map<String, Object?> json) =>
      _$TaskPersonSuggestionDtoFromJson(json);

  final String? userId;

  /// An assistant of this team: the membership to assign.
  final String? membershipId;
  final TaskPersonSuggestionDtoSource source;
  final String name;
  final String? avatarUrl;
  final String? role;
  final String? phone;
  final String? email;

  Map<String, Object?> toJson() => _$TaskPersonSuggestionDtoToJson(this);
}
