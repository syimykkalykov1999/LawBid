// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'sms_opt_out_import_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

SmsOptOutImportDto _$SmsOptOutImportDtoFromJson(Map<String, dynamic> json) =>
    SmsOptOutImportDto(
      phones: (json['phones'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$SmsOptOutImportDtoToJson(SmsOptOutImportDto instance) =>
    <String, dynamic>{'phones': instance.phones};
