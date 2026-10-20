// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'saved_chat_ids_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SavedChatIdsEnvelope _$SavedChatIdsEnvelopeFromJson(
  Map<String, dynamic> json,
) => SavedChatIdsEnvelope(
  data: SavedChatIdsDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$SavedChatIdsEnvelopeToJson(
  SavedChatIdsEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
