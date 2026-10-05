// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_activity_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachActivityDto _$OutreachActivityDtoFromJson(Map<String, dynamic> json) =>
    OutreachActivityDto(
      id: json['id'] as String,
      kind: OutreachActivityKind.fromJson(json['kind'] as String),
      outcome: json['outcome'] as String?,
      body: json['body'] as String?,
      partnerId: json['partnerId'] as String?,
      actorAdminId: json['actorAdminId'] as String?,
      actorName: json['actorName'] as String?,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );

Map<String, dynamic> _$OutreachActivityDtoToJson(
  OutreachActivityDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind.toJson(),
  'outcome': ?instance.outcome,
  'body': ?instance.body,
  'partnerId': ?instance.partnerId,
  'actorAdminId': ?instance.actorAdminId,
  'actorName': ?instance.actorName,
  'createdAt': instance.createdAt.toIso8601String(),
};
