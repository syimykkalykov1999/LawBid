// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'launch_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LaunchItemDto _$LaunchItemDtoFromJson(Map<String, dynamic> json) =>
    LaunchItemDto(
      id: json['id'] as String,
      group: LaunchItemDtoGroup.fromJson(json['group'] as String),
      title: json['title'] as String,
      status: LaunchItemDtoStatus.fromJson(json['status'] as String),
      detail: json['detail'] as String,
      hint: json['hint'] as String?,
      runbook: json['runbook'] as String?,
      manualTick: json['manualTick'] as bool,
      ticked: json['ticked'] as bool,
      action: json['action'] == null
          ? null
          : LaunchItemDtoAction.fromJson(json['action'] as String),
    );

Map<String, dynamic> _$LaunchItemDtoToJson(LaunchItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'group': instance.group.toJson(),
      'title': instance.title,
      'status': instance.status.toJson(),
      'detail': instance.detail,
      'hint': ?instance.hint,
      'runbook': ?instance.runbook,
      'manualTick': instance.manualTick,
      'ticked': instance.ticked,
      'action': ?instance.action?.toJson(),
    };
