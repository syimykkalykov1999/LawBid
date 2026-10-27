// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_appeal_receipt_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAppealReceiptEnvelope _$StaffAppealReceiptEnvelopeFromJson(
  Map<String, dynamic> json,
) => StaffAppealReceiptEnvelope(
  data: StaffAppealReceiptDto.fromJson(json['data'] as Map<String, dynamic>),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$StaffAppealReceiptEnvelopeToJson(
  StaffAppealReceiptEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
