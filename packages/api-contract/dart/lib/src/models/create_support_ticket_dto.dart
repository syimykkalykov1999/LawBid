// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'create_support_ticket_dto_category.dart';
import 'support_attachment_input_dto.dart';
import 'support_client_context_input_dto.dart';

part 'create_support_ticket_dto.g.dart';

@JsonSerializable()
class CreateSupportTicketDto {
  const CreateSupportTicketDto({
    required this.subject,
    required this.category,
    required this.body,
    this.attachments,
    this.context,
  });

  factory CreateSupportTicketDto.fromJson(Map<String, Object?> json) =>
      _$CreateSupportTicketDtoFromJson(json);

  final String subject;
  final CreateSupportTicketDtoCategory category;

  /// May be empty when files are attached.
  final String body;
  final List<SupportAttachmentInputDto>? attachments;
  final SupportClientContextInputDto? context;

  Map<String, Object?> toJson() => _$CreateSupportTicketDtoToJson(this);
}
