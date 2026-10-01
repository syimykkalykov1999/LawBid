// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'update_assistant_dto_duties.dart';

part 'update_assistant_dto.g.dart';

@JsonSerializable()
class UpdateAssistantDto {
  const UpdateAssistantDto({this.name, this.duties});

  factory UpdateAssistantDto.fromJson(Map<String, Object?> json) =>
      _$UpdateAssistantDtoFromJson(json);

  final String? name;
  final List<UpdateAssistantDtoDuties>? duties;

  Map<String, Object?> toJson() => _$UpdateAssistantDtoToJson(this);
}
