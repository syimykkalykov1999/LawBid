// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_me_texts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerMeTextsDto _$PartnerMeTextsDtoFromJson(Map<String, dynamic> json) =>
    PartnerMeTextsDto(
      title: json['title'] as String,
      summary: json['summary'] as String,
      disclosure: json['disclosure'] as String,
      terms: json['terms'] as String,
    );

Map<String, dynamic> _$PartnerMeTextsDtoToJson(PartnerMeTextsDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'summary': instance.summary,
      'disclosure': instance.disclosure,
      'terms': instance.terms,
    };
