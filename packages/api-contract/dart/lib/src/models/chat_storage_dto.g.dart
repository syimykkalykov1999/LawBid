// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chat_storage_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChatStorageDto _$ChatStorageDtoFromJson(Map<String, dynamic> json) =>
    ChatStorageDto(
      photos: json['photos'] as num,
      documents: json['documents'] as num,
      voice: json['voice'] as num,
      usedBytes: json['usedBytes'] as num,
      quotaBytes: json['quotaBytes'] as num?,
    );

Map<String, dynamic> _$ChatStorageDtoToJson(ChatStorageDto instance) =>
    <String, dynamic>{
      'photos': instance.photos,
      'documents': instance.documents,
      'voice': instance.voice,
      'usedBytes': instance.usedBytes,
      'quotaBytes': ?instance.quotaBytes,
    };
