// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'appeal_message_dto.g.dart';

@JsonSerializable()
class AppealMessageDto {
  const AppealMessageDto({required this.message});

  factory AppealMessageDto.fromJson(Map<String, Object?> json) =>
      _$AppealMessageDtoFromJson(json);

  final String message;

  Map<String, Object?> toJson() => _$AppealMessageDtoToJson(this);
}
