// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'paging_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

PagingStatusDto _$PagingStatusDtoFromJson(Map<String, dynamic> json) =>
    PagingStatusDto(
      available: json['available'] as bool,
      configured: json['configured'] as bool,
      endpointMasked: json['endpointMasked'] as String?,
      state: PagingStatusDtoState.fromJson(json['state'] as String),
      stale: json['stale'] as bool,
      checkedAt: json['checkedAt'] as String,
    );

Map<String, dynamic> _$PagingStatusDtoToJson(PagingStatusDto instance) =>
    <String, dynamic>{
      'available': instance.available,
      'configured': instance.configured,
      'endpointMasked': ?instance.endpointMasked,
      'state': instance.state.toJson(),
      'stale': instance.stale,
      'checkedAt': instance.checkedAt,
    };
