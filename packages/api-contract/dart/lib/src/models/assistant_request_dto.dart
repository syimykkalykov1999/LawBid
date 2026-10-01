// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'assistant_request_kind.dart';
import 'assistant_request_status.dart';

part 'assistant_request_dto.g.dart';

@JsonSerializable()
class AssistantRequestDto {
  const AssistantRequestDto({
    required this.id,
    required this.membershipId,
    required this.assistantName,
    required this.kind,
    required this.payload,
    required this.status,
    required this.createdAt,
    this.resultId,
    this.note,
    this.decidedAt,
  });

  factory AssistantRequestDto.fromJson(Map<String, Object?> json) =>
      _$AssistantRequestDtoFromJson(json);

  final String id;
  final String membershipId;
  final String assistantName;
  final AssistantRequestKind kind;
  final dynamic payload;
  final AssistantRequestStatus status;
  final String? resultId;
  final String? note;
  final String createdAt;
  final String? decidedAt;

  Map<String, Object?> toJson() => _$AssistantRequestDtoToJson(this);
}
