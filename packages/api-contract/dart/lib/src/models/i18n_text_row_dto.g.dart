// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'i18n_text_row_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

I18nTextRowDto _$I18nTextRowDtoFromJson(Map<String, dynamic> json) =>
    I18nTextRowDto(
      key: json['key'] as String,
      values: Map<String, String>.from(json['values'] as Map),
      edited: (json['edited'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$I18nTextRowDtoToJson(I18nTextRowDto instance) =>
    <String, dynamic>{
      'key': instance.key,
      'values': instance.values,
      'edited': instance.edited,
    };
