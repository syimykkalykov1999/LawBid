// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'staff_appeal_detail_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

StaffAppealDetailDto _$StaffAppealDetailDtoFromJson(
  Map<String, dynamic> json,
) => StaffAppealDetailDto(
  id: json['id'] as String,
  number: json['number'] as num,
  kind: StaffAppealDetailDtoKind.fromJson(json['kind'] as String),
  excerpt: json['excerpt'] as String,
  head: StaffPersonRefDto.fromJson(json['head'] as Map<String, dynamic>),
  author: StaffAppealAuthorDto.fromJson(json['author'] as Map<String, dynamic>),
  status: StaffAppealDetailDtoStatus.fromJson(json['status'] as String),
  ownerDecision: StaffAppealDetailDtoOwnerDecision.fromJson(
    json['ownerDecision'] as String,
  ),
  redFlag: json['redFlag'] as bool,
  createdAt: DateTime.parse(json['createdAt'] as String),
  decidedAt: json['decidedAt'] == null
      ? null
      : DateTime.parse(json['decidedAt'] as String),
  text: json['text'] as String,
  ownerNote: json['ownerNote'] as String?,
  revealCount: json['revealCount'] as num,
  flags: (json['flags'] as List<dynamic>)
      .map((e) => StaffRetaliationFlagDto.fromJson(e as Map<String, dynamic>))
      .toList(),
);

Map<String, dynamic> _$StaffAppealDetailDtoToJson(
  StaffAppealDetailDto instance,
) => <String, dynamic>{
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
  'text': instance.text,
  'ownerNote': ?instance.ownerNote,
  'revealCount': instance.revealCount,
  'flags': instance.flags.map((e) => e.toJson()).toList(),
};
