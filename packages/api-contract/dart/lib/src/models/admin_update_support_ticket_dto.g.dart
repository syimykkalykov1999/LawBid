// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_update_support_ticket_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUpdateSupportTicketDto _$AdminUpdateSupportTicketDtoFromJson(
  Map<String, dynamic> json,
) => AdminUpdateSupportTicketDto(
  status: json['status'] == null
      ? null
      : AdminUpdateSupportTicketDtoStatus.fromJson(json['status'] as String),
  priority: json['priority'] == null
      ? null
      : AdminUpdateSupportTicketDtoPriority.fromJson(
          json['priority'] as String,
        ),
  assigneeId: json['assigneeId'] as String?,
);

Map<String, dynamic> _$AdminUpdateSupportTicketDtoToJson(
  AdminUpdateSupportTicketDto instance,
) => <String, dynamic>{
  'status': ?instance.status?.toJson(),
  'priority': ?instance.priority?.toJson(),
  'assigneeId': ?instance.assigneeId,
};
