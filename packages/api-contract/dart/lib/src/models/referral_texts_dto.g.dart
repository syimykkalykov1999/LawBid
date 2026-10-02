// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_texts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralTextsDto _$ReferralTextsDtoFromJson(Map<String, dynamic> json) =>
    ReferralTextsDto(
      title: json['title'] as String,
      summary: json['summary'] as String,
      terms: json['terms'] as String,
      shareMessage: json['shareMessage'] as String,
    );

Map<String, dynamic> _$ReferralTextsDtoToJson(ReferralTextsDto instance) =>
    <String, dynamic>{
      'title': instance.title,
      'summary': instance.summary,
      'terms': instance.terms,
      'shareMessage': instance.shareMessage,
    };
