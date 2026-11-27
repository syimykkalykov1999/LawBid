// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_mls_welcome_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMlsWelcomeDto _$GroupMlsWelcomeDtoFromJson(Map<String, dynamic> json) =>
    GroupMlsWelcomeDto(
      id: json['id'] as String,
      groupId: json['groupId'] as String,
      epoch: json['epoch'] as num,
      welcome: json['welcome'] as String,
    );

Map<String, dynamic> _$GroupMlsWelcomeDtoToJson(GroupMlsWelcomeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'groupId': instance.groupId,
      'epoch': instance.epoch,
      'welcome': instance.welcome,
    };
