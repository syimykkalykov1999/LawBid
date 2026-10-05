// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'trust_set_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

TrustSetStatusDto _$TrustSetStatusDtoFromJson(Map<String, dynamic> json) =>
    TrustSetStatusDto(
      status: TrustSetStatusDtoStatus.fromJson(json['status'] as String),
      note: json['note'] as String,
    );

Map<String, dynamic> _$TrustSetStatusDtoToJson(TrustSetStatusDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'note': instance.note,
    };
