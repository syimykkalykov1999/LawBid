// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'phone_changed_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PhoneChangedDto _$PhoneChangedDtoFromJson(Map<String, dynamic> json) =>
    PhoneChangedDto(
      userId: json['userId'] as String,
      phone: json['phone'] as String,
      revokedSessions: json['revokedSessions'] as num,
    );

Map<String, dynamic> _$PhoneChangedDtoToJson(PhoneChangedDto instance) =>
    <String, dynamic>{
      'userId': instance.userId,
      'phone': instance.phone,
      'revokedSessions': instance.revokedSessions,
    };
