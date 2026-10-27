// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'next_lease_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

NextLeaseResultDto _$NextLeaseResultDtoFromJson(Map<String, dynamic> json) =>
    NextLeaseResultDto(
      status: LeaseNextStatus.fromJson(json['status'] as String),
      lease: json['lease'] == null
          ? null
          : LeaseDto.fromJson(json['lease'] as Map<String, dynamic>),
      held: (json['held'] as List<dynamic>?)
          ?.map((e) => LeaseDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      retryAfterSec: json['retryAfterSec'] as num?,
    );

Map<String, dynamic> _$NextLeaseResultDtoToJson(NextLeaseResultDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'lease': ?instance.lease?.toJson(),
      'held': ?instance.held?.map((e) => e.toJson()).toList(),
      'retryAfterSec': ?instance.retryAfterSec,
    };
