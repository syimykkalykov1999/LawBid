// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'partner_texts_by_lang_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PartnerTextsByLangDto _$PartnerTextsByLangDtoFromJson(
  Map<String, dynamic> json,
) => PartnerTextsByLangDto(
  en: PartnerTextsDto.fromJson(json['en'] as Map<String, dynamic>),
  ru: PartnerTextsDto.fromJson(json['ru'] as Map<String, dynamic>),
);

Map<String, dynamic> _$PartnerTextsByLangDtoToJson(
  PartnerTextsByLangDto instance,
) => <String, dynamic>{'en': instance.en.toJson(), 'ru': instance.ru.toJson()};
