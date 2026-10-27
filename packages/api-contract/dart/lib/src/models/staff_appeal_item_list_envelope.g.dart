// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_appeal_item_list_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAppealItemListEnvelope _$StaffAppealItemListEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffAppealItemListEnvelope(
  data: (json['data'] as List<dynamic>)
      .map((e) => StaffAppealItemDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffAppealItemListEnvelopeToJson(
  StaffAppealItemListEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.map((e) => e.toJson()).toList(),
  'meta': ?instance.meta?.toJson(),
};
