// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_bundle_envelope.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nBundleEnvelope _$I18nBundleEnvelopeFromJson(Map<String, dynamic> json) =>
    I18nBundleEnvelope(
      data: I18nBundleDto.fromJson(json['data'] as Map<String, dynamic>),
      meta: json['meta'] == null
          ? null
          : ResponseMetaDto.fromJson(json['meta'] as Map<String, dynamic>),
    );

Map<String, dynamic> _$I18nBundleEnvelopeToJson(I18nBundleEnvelope instance) =>
    <String, dynamic>{
      'data': instance.data.toJson(),
      'meta': ?instance.meta?.toJson(),
    };
