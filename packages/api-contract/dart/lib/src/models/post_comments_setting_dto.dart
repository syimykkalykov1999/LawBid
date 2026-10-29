// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'post_comments_setting_dto.g.dart';

@JsonSerializable()
class PostCommentsSettingDto {
  const PostCommentsSettingDto({
    required this.enabled,
  });
  
  factory PostCommentsSettingDto.fromJson(Map<String, Object?> json) => _$PostCommentsSettingDtoFromJson(json);
  
  final bool enabled;

  Map<String, Object?> toJson() => _$PostCommentsSettingDtoToJson(this);
}
