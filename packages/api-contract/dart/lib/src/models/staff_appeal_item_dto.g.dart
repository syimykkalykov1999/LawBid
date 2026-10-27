// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_appeal_item_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAppealItemDto _$StaffAppealItemDtoFromJson(Map<String, dynamic> json) =>
    StaffAppealItemDto(
      id: json['id'] as String,
      number: json['number'] as num,
      kind: StaffAppealItemDtoKind.fromJson(json['kind'] as String),
      excerpt: json['excerpt'] as String,
      head: StaffPersonRefDto.fromJson(json['head'] as Map<String, dynamic>),
      author: StaffAppealAuthorDto.fromJson(
        json['author'] as Map<String, dynamic>,
      ),
      status: StaffAppealItemDtoStatus.fromJson(json['status'] as String),
      ownerDecision: StaffAppealItemDtoOwnerDecision.fromJson(
        json['ownerDecision'] as String,
      ),
      redFlag: json['redFlag'] as bool,
      createdAt: DateTime.parse(json['createdAt'] as String),
      decidedAt: json['decidedAt'] == null
          ? null
          : DateTime.parse(json['decidedAt'] as String),
    );

Map<String, dynamic> _$StaffAppealItemDtoToJson(StaffAppealItemDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'number': instance.number,
      'kind': instance.kind.toJson(),
      'excerpt': instance.excerpt,
      'head': instance.head.toJson(),
      'author': instance.author.toJson(),
      'status': instance.status.toJson(),
      'ownerDecision': instance.ownerDecision.toJson(),
      'redFlag': instance.redFlag,
      'createdAt': instance.createdAt.toIso8601String(),
      'decidedAt': ?instance.decidedAt?.toIso8601String(),
    };
