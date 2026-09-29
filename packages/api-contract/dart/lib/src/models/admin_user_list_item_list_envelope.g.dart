// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_list_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserListItemListEnvelope _$AdminUserListItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminUserListItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => AdminUserListItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminUserListItemListEnvelopeToJson(
  AdminUserListItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
