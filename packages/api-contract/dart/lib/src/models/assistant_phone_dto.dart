// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'assistant_phone_dto.g.dart';

@JsonSerializable()
class AssistantPhoneDto {
  const AssistantPhoneDto({required this.phone});

  factory AssistantPhoneDto.fromJson(Map<String, Object?> json) =>
      _$AssistantPhoneDtoFromJson(json);

  final String phone;

  Map<String, Object?> toJson() => _$AssistantPhoneDtoToJson(this);
}
