// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'read_group_dto.g.dart';

@JsonSerializable()
class ReadGroupDto {
  const ReadGroupDto({required this.lastReadMessageId});

  factory ReadGroupDto.fromJson(Map<String, Object?> json) =>
      _$ReadGroupDtoFromJson(json);

  final String lastReadMessageId;

  Map<String, Object?> toJson() => _$ReadGroupDtoToJson(this);
}
