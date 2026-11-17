// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_message_readers_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

GroupMessageReadersDto _$GroupMessageReadersDtoFromJson(
  Map<String, dynamic> json,
) => GroupMessageReadersDto(
  readers: (json['readers'] as List<dynamic>)
      .map((e) => GroupPersonDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  recipients: (json['recipients'] as num).toInt(),
);

Map<String, dynamic> _$GroupMessageReadersDtoToJson(
  GroupMessageReadersDto instance,
) => <String, dynamic>{
  'readers': instance.readers.map((e) => e.toJson()).toList(),
  'recipients': instance.recipients,
};
