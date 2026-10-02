// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_promotion_action_result_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPromotionActionResultEnvelope _$AdminPromotionActionResultEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPromotionActionResultEnvelope(
  data: AdminPromotionActionResultDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPromotionActionResultEnvelopeToJson(
  AdminPromotionActionResultEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
