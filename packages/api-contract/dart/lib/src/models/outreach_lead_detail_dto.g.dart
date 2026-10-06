// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_lead_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachLeadDetailDto _$OutreachLeadDetailDtoFromJson(
  Map<String, dynamic> json,
) => OutreachLeadDetailDto(
  id: json['id'] as String,
  kind: OutreachLeadKind.fromJson(json['kind'] as String),
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  company: json['company'] as String?,
  stateCode: json['stateCode'] as String?,
  city: json['city'] as String?,
  practice: json['practice'] as String?,
  phone: json['phone'] as String?,
  email: json['email'] as String?,
  source: OutreachLeadSource.fromJson(json['source'] as String),
  status: OutreachLeadStatus.fromJson(json['status'] as String),
  partner: json['partner'] == null
      ? null
      : OutreachPartnerDto.fromJson(json['partner'] as Map<String, dynamic>),
  convertedUserId: json['convertedUserId'] as String?,
  unsubscribed: json['unsubscribed'] as bool,
  lastActivityAt: json['lastActivityAt'] == null
      ? null
      : DateTime.parse(json['lastActivityAt'] as String),
  nextActionAt: json['nextActionAt'] == null
      ? null
      : DateTime.parse(json['nextActionAt'] as String),
  note: json['note'] as String?,
  doNotContact: json['doNotContact'] as bool,
  doNotContactReason: json['doNotContactReason'] as String?,
  sourceNote: json['sourceNote'] as String?,
  emailsSent: json['emailsSent'] as num,
  createdAt: DateTime.parse(json['createdAt'] as String),
  activities: (json['activities'] as List<dynamic>)
      .map((e) => OutreachActivityDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  canEmail: json['canEmail'] as bool,
  callAllowed: json['callAllowed'] as bool,
  callWindow: json['callWindow'] as String?,
  callBlocked: json['callBlocked'] == null
      ? null
      : OutreachContactBlockReason.fromJson(json['callBlocked'] as String),
  emailBlocked: json['emailBlocked'] == null
      ? null
      : OutreachContactBlockReason.fromJson(json['emailBlocked'] as String),
  phoneHidden: json['phoneHidden'] as bool,
);

Map<String, dynamic> _$OutreachLeadDetailDtoToJson(
  OutreachLeadDetailDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'kind': instance.kind.toJson(),
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'company': ?instance.company,
  'stateCode': ?instance.stateCode,
  'city': ?instance.city,
  'practice': ?instance.practice,
  'phone': ?instance.phone,
  'email': ?instance.email,
  'source': instance.source.toJson(),
  'status': instance.status.toJson(),
  'partner': ?instance.partner?.toJson(),
  'convertedUserId': ?instance.convertedUserId,
  'unsubscribed': instance.unsubscribed,
  'lastActivityAt': ?instance.lastActivityAt?.toIso8601String(),
  'nextActionAt': ?instance.nextActionAt?.toIso8601String(),
  'note': ?instance.note,
  'doNotContact': instance.doNotContact,
  'doNotContactReason': ?instance.doNotContactReason,
  'sourceNote': ?instance.sourceNote,
  'emailsSent': instance.emailsSent,
  'createdAt': instance.createdAt.toIso8601String(),
  'activities': instance.activities.map((e) => e.toJson()).toList(),
  'canEmail': instance.canEmail,
  'callAllowed': instance.callAllowed,
  'callWindow': ?instance.callWindow,
  'callBlocked': ?instance.callBlocked?.toJson(),
  'emailBlocked': ?instance.emailBlocked?.toJson(),
  'phoneHidden': instance.phoneHidden,
};
