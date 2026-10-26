// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'firm_member_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

FirmMemberDto _$FirmMemberDtoFromJson(Map<String, dynamic> json) =>
    FirmMemberDto(
      attorneyId: json['attorneyId'] as String,
      firstName: json['firstName'] as String?,
      lastName: json['lastName'] as String?,
      role: FirmMemberDtoRole.fromJson(json['role'] as String),
      status: FirmMemberDtoStatus.fromJson(json['status'] as String),
      states: (json['states'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$FirmMemberDtoToJson(FirmMemberDto instance) =>
    <String, dynamic>{
      'attorneyId': instance.attorneyId,
      'firstName': ?instance.firstName,
      'lastName': ?instance.lastName,
      'role': instance.role.toJson(),
      'status': instance.status.toJson(),
      'states': instance.states,
    };
