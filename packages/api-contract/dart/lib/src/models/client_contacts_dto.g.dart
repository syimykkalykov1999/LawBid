// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_contacts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientContactsDto _$ClientContactsDtoFromJson(Map<String, dynamic> json) =>
    ClientContactsDto(
      caseId: json['caseId'] as String,
      bidId: json['bidId'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      phone: json['phone'] as String?,
      email: json['email'] as String?,
      contactMethod: json['contactMethod'] == null
          ? null
          : ContactMethod.fromJson(json['contactMethod'] as String),
      contactNote: json['contactNote'] as String?,
      disclosedAt: DateTime.parse(json['disclosedAt'] as String),
    );

Map<String, dynamic> _$ClientContactsDtoToJson(ClientContactsDto instance) =>
    <String, dynamic>{
      'caseId': instance.caseId,
      'bidId': instance.bidId,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'phone': ?instance.phone,
      'email': ?instance.email,
      'contactMethod': ?instance.contactMethod?.toJson(),
      'contactNote': ?instance.contactNote,
      'disclosedAt': instance.disclosedAt.toIso8601String(),
    };
