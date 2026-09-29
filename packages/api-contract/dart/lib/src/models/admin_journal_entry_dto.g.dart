// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_journal_entry_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminJournalEntryDto _$AdminJournalEntryDtoFromJson(
  Map<String, dynamic> json,
) => AdminJournalEntryDto(
  id: json['id'] as String,
  eventType: json['eventType'] as String,
  actorRole: json['actorRole'] as String?,
  actorUserId: json['actorUserId'] as String?,
  payload: json['payload'],
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminJournalEntryDtoToJson(
  AdminJournalEntryDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'eventType': instance.eventType,
  'actorRole': ?instance.actorRole,
  'actorUserId': ?instance.actorUserId,
  'payload': ?instance.payload,
  'createdAt': instance.createdAt.toIso8601String(),
};
