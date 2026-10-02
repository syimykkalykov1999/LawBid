// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'referral_texts_by_lang_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ReferralTextsByLangDto _$ReferralTextsByLangDtoFromJson(
  Map<String, dynamic> json,
) => ReferralTextsByLangDto(
  en: ReferralTextsDto.fromJson(json['en'] as Map<String, dynamic>),
  ru: ReferralTextsDto.fromJson(json['ru'] as Map<String, dynamic>),
);

Map<String, dynamic> _$ReferralTextsByLangDtoToJson(
  ReferralTextsByLangDto instance,
) => <String, dynamic>{'en': instance.en.toJson(), 'ru': instance.ru.toJson()};
