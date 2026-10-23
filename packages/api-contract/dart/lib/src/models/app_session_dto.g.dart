// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'app_session_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AppSessionDto _$AppSessionDtoFromJson(Map<String, dynamic> json) =>
    AppSessionDto(
      me: MeDto.fromJson(json['me'] as Map<String, dynamic>),
      badges: BadgesDto.fromJson(json['badges'] as Map<String, dynamic>),
      bootstrapVersion: json['bootstrapVersion'] as String,
      flags: Map<String, bool>.from(json['flags'] as Map),
      unreadSupport: (json['unreadSupport'] as num).toInt(),
      hasOngoingCalls: json['hasOngoingCalls'] as bool,
      client: ClientTimingsDto.fromJson(json['client'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$AppSessionDtoToJson(AppSessionDto instance) =>
    <String, dynamic>{
      'me': instance.me.toJson(),
      'badges': instance.badges.toJson(),
      'bootstrapVersion': instance.bootstrapVersion,
      'flags': instance.flags,
      'unreadSupport': instance.unreadSupport,
      'hasOngoingCalls': instance.hasOngoingCalls,
      'client': instance.client.toJson(),
    };
