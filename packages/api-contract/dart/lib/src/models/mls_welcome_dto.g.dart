// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'mls_welcome_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MlsWelcomeDto _$MlsWelcomeDtoFromJson(Map<String, dynamic> json) =>
    MlsWelcomeDto(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      epoch: json['epoch'] as num,
      welcome: json['welcome'] as String,
    );

Map<String, dynamic> _$MlsWelcomeDtoToJson(MlsWelcomeDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'conversationId': instance.conversationId,
      'epoch': instance.epoch,
      'welcome': instance.welcome,
    };
