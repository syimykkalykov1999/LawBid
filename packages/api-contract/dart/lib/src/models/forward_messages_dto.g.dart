// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'forward_messages_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ForwardMessagesDto _$ForwardMessagesDtoFromJson(Map<String, dynamic> json) =>
    ForwardMessagesDto(
      requestId: json['requestId'] as String,
      sources: (json['sources'] as List<dynamic>)
          .map((e) => ForwardSourceDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      targets: (json['targets'] as List<dynamic>)
          .map((e) => ForwardTargetDto.fromJson(e as Map<String, dynamic>))
          .toList(),
    );

Map<String, dynamic> _$ForwardMessagesDtoToJson(ForwardMessagesDto instance) =>
    <String, dynamic>{
      'requestId': instance.requestId,
      'sources': instance.sources.map((e) => e.toJson()).toList(),
      'targets': instance.targets.map((e) => e.toJson()).toList(),
    };
