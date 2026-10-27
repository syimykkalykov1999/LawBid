// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'piecework_dispute_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PieceworkDisputeResultDto _$PieceworkDisputeResultDtoFromJson(
  Map<String, dynamic> json,
) => PieceworkDisputeResultDto(
  status: PieceworkDisputeResultDtoStatus.fromJson(json['status'] as String),
  accrual: PieceworkDisputeResultDtoAccrual.fromJson(json['accrual'] as String),
);

Map<String, dynamic> _$PieceworkDisputeResultDtoToJson(
  PieceworkDisputeResultDto instance,
) => <String, dynamic>{
  'status': instance.status.toJson(),
  'accrual': instance.accrual.toJson(),
};
