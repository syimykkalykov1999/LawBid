// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'media_hidden_target_dto_type.dart';

part 'media_hidden_target_dto.g.dart';

@JsonSerializable()
class MediaHiddenTargetDto {
  const MediaHiddenTargetDto({required this.type, required this.id});

  factory MediaHiddenTargetDto.fromJson(Map<String, Object?> json) =>
      _$MediaHiddenTargetDtoFromJson(json);

  final MediaHiddenTargetDtoType type;
  final String id;

  Map<String, Object?> toJson() => _$MediaHiddenTargetDtoToJson(this);
}
