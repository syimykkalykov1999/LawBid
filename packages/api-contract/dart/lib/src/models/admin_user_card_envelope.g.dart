// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_user_card_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminUserCardEnvelope _$AdminUserCardEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminUserCardEnvelope(
  data: AdminUserCardDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminUserCardEnvelopeToJson(
  AdminUserCardEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
