// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'chain_check_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ChainCheckDto _$ChainCheckDtoFromJson(Map<String, dynamic> json) =>
    ChainCheckDto(
      checked: json['checked'] as num,
      brokenAtSeq: json['brokenAtSeq'] as num?,
      headHash: json['headHash'] as String?,
      headSeq: json['headSeq'] as num?,
    );

Map<String, dynamic> _$ChainCheckDtoToJson(ChainCheckDto instance) =>
    <String, dynamic>{
      'checked': instance.checked,
      'brokenAtSeq': ?instance.brokenAtSeq,
      'headHash': ?instance.headHash,
      'headSeq': ?instance.headSeq,
    };
