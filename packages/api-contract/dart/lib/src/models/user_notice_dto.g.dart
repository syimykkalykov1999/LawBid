// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'user_notice_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UserNoticeDto _$UserNoticeDtoFromJson(Map<String, dynamic> json) =>
    UserNoticeDto(
      allowed: json['allowed'] as bool,
      blockedReason: json['blockedReason'] as String?,
      text: json['text'] as String,
      language: json['language'] as String,
      userNotifiedAt: json['userNotifiedAt'] as String?,
    );

Map<String, dynamic> _$UserNoticeDtoToJson(UserNoticeDto instance) =>
    <String, dynamic>{
      'allowed': instance.allowed,
      'blockedReason': ?instance.blockedReason,
      'text': instance.text,
      'language': instance.language,
      'userNotifiedAt': ?instance.userNotifiedAt,
    };
