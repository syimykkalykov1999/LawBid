// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_support_ticket_dto_category.dart';

part 'create_support_ticket_dto.g.dart';

@JsonSerializable()
class CreateSupportTicketDto {
  const CreateSupportTicketDto({
    required this.subject,
    required this.category,
    required this.body,
  });

  factory CreateSupportTicketDto.fromJson(Map<String, Object?> json) =>
      _$CreateSupportTicketDtoFromJson(json);

  final String subject;
  final CreateSupportTicketDtoCategory category;
  final String body;

  Map<String, Object?> toJson() => _$CreateSupportTicketDtoToJson(this);
}
