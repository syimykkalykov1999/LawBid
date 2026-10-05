// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_payment_settings_view_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminPaymentSettingsViewEnvelope _$AdminPaymentSettingsViewEnvelopeFromJson(
  Map<String, dynamic> json,
) => AdminPaymentSettingsViewEnvelope(
  data: AdminPaymentSettingsViewDto.fromJson(
    json['data'] as Map<String, dynamic>,
  ),
  meta: json['meta'] == null
      ? null
      : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
);

Map<String, dynamic> _$AdminPaymentSettingsViewEnvelopeToJson(
  AdminPaymentSettingsViewEnvelope instance,
) => <String, dynamic>{
  'data': instance.data.toJson(),
  'meta': ?instance.meta?.toJson(),
};
