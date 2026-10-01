// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'assistant_request_kind.dart';

part 'create_assistant_request_dto.g.dart';

@JsonSerializable()
class CreateAssistantRequestDto {
  const CreateAssistantRequestDto({required this.kind, required this.payload});

  factory CreateAssistantRequestDto.fromJson(Map<String, Object?> json) =>
      _$CreateAssistantRequestDtoFromJson(json);

  final AssistantRequestKind kind;

  /// post: {title, body, practiceCode, kind, mediaFileIds}; comment: {postId, body, parentId?}; case_comment: {caseId, body}; profile_edit: {bio?, firmName?, languages?}
  final dynamic payload;

  Map<String, Object?> toJson() => _$CreateAssistantRequestDtoToJson(this);
}
