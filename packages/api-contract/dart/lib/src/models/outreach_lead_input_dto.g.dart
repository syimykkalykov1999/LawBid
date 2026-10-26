// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'outreach_lead_input_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

OutreachLeadInputDto _$OutreachLeadInputDtoFromJson(
  Map<String, dynamic> json,
) => OutreachLeadInputDto(
  kind: json['kind'] == null
      ? null
      : OutreachLeadKind.fromJson(json['kind'] as String),
  firstName: json['firstName'] as String?,
  lastName: json['lastName'] as String?,
  company: json['company'] as String?,
  stateCode: json['stateCode'] as String?,
  city: json['city'] as String?,
  practice: json['practice'] as String?,
  phone: json['phone'] as String?,
  email: json['email'] as String?,
  note: json['note'] as String?,
  nextActionAt: json['nextActionAt'] == null
      ? null
      : DateTime.parse(json['nextActionAt'] as String),
  partnerId: json['partnerId'] as String?,
  status: json['status'] == null
      ? null
      : OutreachLeadStatus.fromJson(json['status'] as String),
  sourceNote: json['sourceNote'] as String?,
  doNotContact: json['doNotContact'] as bool?,
);

Map<String, dynamic> _$OutreachLeadInputDtoToJson(
  OutreachLeadInputDto instance,
) => <String, dynamic>{
  'kind': ?instance.kind?.toJson(),
  'firstName': ?instance.firstName,
  'lastName': ?instance.lastName,
  'company': ?instance.company,
  'stateCode': ?instance.stateCode,
  'city': ?instance.city,
  'practice': ?instance.practice,
  'phone': ?instance.phone,
  'email': ?instance.email,
  'note': ?instance.note,
  'nextActionAt': ?instance.nextActionAt?.toIso8601String(),
  'partnerId': ?instance.partnerId,
  'status': ?instance.status?.toJson(),
  'sourceNote': ?instance.sourceNote,
  'doNotContact': ?instance.doNotContact,
};
