// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cost_row_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CostRowStatusDto _$CostRowStatusDtoFromJson(Map<String, dynamic> json) =>
    CostRowStatusDto(
      state: CostRowStatusDtoState.fromJson(json['state'] as String),
      live: CostRowStatusDtoLive.fromJson(json['live'] as String),
      reason: json['reason'] as String,
      checkedAt: json['checkedAt'] as String,
    );

Map<String, dynamic> _$CostRowStatusDtoToJson(CostRowStatusDto instance) =>
    <String, dynamic>{
      'state': instance.state.toJson(),
      'live': instance.live.toJson(),
      'reason': instance.reason,
      'checkedAt': instance.checkedAt,
    };
