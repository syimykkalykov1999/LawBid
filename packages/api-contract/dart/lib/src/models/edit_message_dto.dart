// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'edit_message_dto.g.dart';

@JsonSerializable()
class EditMessageDto {
  const EditMessageDto({required this.body});

  factory EditMessageDto.fromJson(Map<String, Object?> json) =>
      _$EditMessageDtoFromJson(json);

  final String body;

  Map<String, Object?> toJson() => _$EditMessageDtoToJson(this);
}
