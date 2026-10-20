// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_appeal_dto.g.dart';

@JsonSerializable()
class CreateAppealDto {
  const CreateAppealDto({required this.actionId, required this.message});

  factory CreateAppealDto.fromJson(Map<String, Object?> json) =>
      _$CreateAppealDtoFromJson(json);

  final String actionId;
  final String message;

  Map<String, Object?> toJson() => _$CreateAppealDtoToJson(this);
}
