// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'edit_group_message_dto.g.dart';

@JsonSerializable()
class EditGroupMessageDto {
  const EditGroupMessageDto({required this.body});

  factory EditGroupMessageDto.fromJson(Map<String, Object?> json) =>
      _$EditGroupMessageDtoFromJson(json);

  final String body;

  Map<String, Object?> toJson() => _$EditGroupMessageDtoToJson(this);
}
