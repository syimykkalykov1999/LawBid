// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'role_switch_preview_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

RoleSwitchPreviewDto _$RoleSwitchPreviewDtoFromJson(
  Map<String, dynamic> json,
) => RoleSwitchPreviewDto(
  from: RoleSwitchPreviewDtoFrom.fromJson(json['from'] as String),
  to: RoleSwitchPreviewDtoTo.fromJson(json['to'] as String),
  allowed: json['allowed'] as bool,
  blockers: (json['blockers'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  needsOnboarding: json['needsOnboarding'] as bool,
  retryAfterSeconds: (json['retryAfterSeconds'] as num).toInt(),
);

Map<String, dynamic> _$RoleSwitchPreviewDtoToJson(
  RoleSwitchPreviewDto instance,
) => <String, dynamic>{
  'from': instance.from.toJson(),
  'to': instance.to.toJson(),
  'allowed': instance.allowed,
  'blockers': instance.blockers,
  'needsOnboarding': instance.needsOnboarding,
  'retryAfterSeconds': instance.retryAfterSeconds,
};
