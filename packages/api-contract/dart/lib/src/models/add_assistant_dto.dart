// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'add_assistant_dto_duties.dart';

part 'add_assistant_dto.g.dart';

@JsonSerializable()
class AddAssistantDto {
  const AddAssistantDto({required this.phone, this.name, this.duties});

  factory AddAssistantDto.fromJson(Map<String, Object?> json) =>
      _$AddAssistantDtoFromJson(json);

  final String phone;
  final String? name;
  final List<AddAssistantDtoDuties>? duties;

  Map<String, Object?> toJson() => _$AddAssistantDtoToJson(this);
}
