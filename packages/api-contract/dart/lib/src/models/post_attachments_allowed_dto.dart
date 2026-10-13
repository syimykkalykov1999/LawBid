// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'post_attachments_allowed_dto_mode.dart';

part 'post_attachments_allowed_dto.g.dart';

@JsonSerializable()
class PostAttachmentsAllowedDto {
  const PostAttachmentsAllowedDto({required this.allowed, required this.mode});

  factory PostAttachmentsAllowedDto.fromJson(Map<String, Object?> json) =>
      _$PostAttachmentsAllowedDtoFromJson(json);

  final bool allowed;
  final PostAttachmentsAllowedDtoMode mode;

  Map<String, Object?> toJson() => _$PostAttachmentsAllowedDtoToJson(this);
}
