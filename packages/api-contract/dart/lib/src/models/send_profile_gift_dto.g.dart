// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'send_profile_gift_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SendProfileGiftDto _$SendProfileGiftDtoFromJson(Map<String, dynamic> json) =>
    SendProfileGiftDto(
      recipientId: json['recipientId'] as String,
      note: json['note'] as String?,
      anonymous: json['anonymous'] as bool?,
    );

Map<String, dynamic> _$SendProfileGiftDtoToJson(SendProfileGiftDto instance) =>
    <String, dynamic>{
      'recipientId': instance.recipientId,
      'note': ?instance.note,
      'anonymous': ?instance.anonymous,
    };
