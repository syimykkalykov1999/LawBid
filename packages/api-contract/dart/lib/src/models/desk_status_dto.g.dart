// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'desk_status_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

DeskStatusDto _$DeskStatusDtoFromJson(Map<String, dynamic> json) =>
    DeskStatusDto(status: DeskPresence.fromJson(json['status'] as String));

Map<String, dynamic> _$DeskStatusDtoToJson(DeskStatusDto instance) =>
    <String, dynamic>{'status': instance.status.toJson()};
