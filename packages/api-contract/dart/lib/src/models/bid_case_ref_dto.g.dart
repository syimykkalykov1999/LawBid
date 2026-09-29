// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'bid_case_ref_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BidCaseRefDto _$BidCaseRefDtoFromJson(Map<String, dynamic> json) =>
    BidCaseRefDto(
      id: json['id'] as String,
      title: json['title'] as String,
      status: json['status'] as String,
      primaryStateCode: json['primaryStateCode'] as String,
      practiceAreaNameEn: json['practiceAreaNameEn'] as String,
      practiceAreaI18nKey: json['practiceAreaI18nKey'] as String,
    );

Map<String, dynamic> _$BidCaseRefDtoToJson(BidCaseRefDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'status': instance.status,
      'primaryStateCode': instance.primaryStateCode,
      'practiceAreaNameEn': instance.practiceAreaNameEn,
      'practiceAreaI18nKey': instance.practiceAreaI18nKey,
    };
