// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'response_meta_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ResponseMetaDto _$ResponseMetaDtoFromJson(Map<String, dynamic> json) =>
    ResponseMetaDto(
      nextCursor: json['nextCursor'] as String?,
      deletedIds: (json['deletedIds'] as List<dynamic>?)
          ?.map((e) => e as String)
          .toList(),
      syncedAt: json['syncedAt'] == null
          ? null
          : DateTime.parse(json['syncedAt'] as String),
      disclaimer: json['disclaimer'] == null
          ? null
          : LegalDisclaimerDto.fromJson(
              json['disclaimer'] as Map<String, dynamic>,
            ),
    );

Map<String, dynamic> _$ResponseMetaDtoToJson(ResponseMetaDto instance) =>
    <String, dynamic>{
      'nextCursor': ?instance.nextCursor,
      'deletedIds': ?instance.deletedIds,
      'syncedAt': ?instance.syncedAt?.toIso8601String(),
      'disclaimer': ?instance.disclaimer?.toJson(),
    };
