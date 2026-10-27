// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'my_leases_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

MyLeasesDto _$MyLeasesDtoFromJson(Map<String, dynamic> json) => MyLeasesDto(
  status: DeskPresence.fromJson(json['status'] as String),
  leases: (json['leases'] as List<dynamic>)
      .map((e) => LeaseDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  capacity: LeaseCapacityDto.fromJson(json['capacity'] as Map<String, dynamic>),
  wrapUpSec: json['wrapUpSec'] as num,
);

Map<String, dynamic> _$MyLeasesDtoToJson(MyLeasesDto instance) =>
    <String, dynamic>{
      'status': instance.status.toJson(),
      'leases': instance.leases.map((e) => e.toJson()).toList(),
      'capacity': instance.capacity.toJson(),
      'wrapUpSec': instance.wrapUpSec,
    };
