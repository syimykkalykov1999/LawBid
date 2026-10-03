// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'block_result_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

BlockResultDto _$BlockResultDtoFromJson(Map<String, dynamic> json) =>
    BlockResultDto(
      bans: (json['bans'] as List<dynamic>)
          .map((e) => AdminBanDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      revokedSessions: (json['revokedSessions'] as num).toInt(),
    );

Map<String, dynamic> _$BlockResultDtoToJson(BlockResultDto instance) =>
    <String, dynamic>{
      'bans': instance.bans.map((e) => e.toJson()).toList(),
      'revokedSessions': instance.revokedSessions,
    };
