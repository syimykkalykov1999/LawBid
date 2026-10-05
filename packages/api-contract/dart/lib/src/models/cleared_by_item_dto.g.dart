// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'cleared_by_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClearedByItemDto _$ClearedByItemDtoFromJson(Map<String, dynamic> json) =>
    ClearedByItemDto(
      attorney: AdminTrustAttorneyDto.fromJson(
        json['attorney'] as Map<String, dynamic>,
      ),
      level: (json['level'] as num).toInt(),
      clearedAt: DateTime.parse(json['clearedAt'] as String),
      complaintsAfter: (json['complaintsAfter'] as num).toInt(),
      suspendedAfter: json['suspendedAfter'] as bool,
      documentsSeen: (json['documentsSeen'] as List<dynamic>)
          .map((e) => e as String)
          .toList(),
    );

Map<String, dynamic> _$ClearedByItemDtoToJson(ClearedByItemDto instance) =>
    <String, dynamic>{
      'attorney': instance.attorney.toJson(),
      'level': instance.level,
      'clearedAt': instance.clearedAt.toIso8601String(),
      'complaintsAfter': instance.complaintsAfter,
      'suspendedAfter': instance.suspendedAfter,
      'documentsSeen': instance.documentsSeen,
    };
