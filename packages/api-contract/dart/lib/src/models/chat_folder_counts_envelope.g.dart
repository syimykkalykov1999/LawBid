// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chat_folder_counts_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChatFolderCountsEnvelope _$ChatFolderCountsEnvelopeFromJson(
  Map<String, dynamic> json,
) => ChatFolderCountsEnvelope(
  data: ChatFolderCountsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ChatFolderCountsEnvelopeToJson(
  ChatFolderCountsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
