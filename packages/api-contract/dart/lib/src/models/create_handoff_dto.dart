// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'create_handoff_dto.g.dart';

@JsonSerializable()
class CreateHandoffDto {
  const CreateHandoffDto({required this.requestId});

  factory CreateHandoffDto.fromJson(Map<String, Object?> json) =>
      _$CreateHandoffDtoFromJson(json);

  final String requestId;

  Map<String, Object?> toJson() => _$CreateHandoffDtoToJson(this);
}
