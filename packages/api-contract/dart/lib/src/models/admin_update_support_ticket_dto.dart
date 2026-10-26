// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_update_support_ticket_dto_priority.dart';
import 'admin_update_support_ticket_dto_status.dart';

part 'admin_update_support_ticket_dto.g.dart';

@JsonSerializable()
class AdminUpdateSupportTicketDto {
  const AdminUpdateSupportTicketDto({
    this.status,
    this.priority,
    this.assigneeId,
  });

  factory AdminUpdateSupportTicketDto.fromJson(Map<String, Object?> json) =>
      _$AdminUpdateSupportTicketDtoFromJson(json);

  final AdminUpdateSupportTicketDtoStatus? status;
  final AdminUpdateSupportTicketDtoPriority? priority;

  /// An admin user id; null unassigns.
  final String? assigneeId;

  Map<String, Object?> toJson() => _$AdminUpdateSupportTicketDtoToJson(this);
}
