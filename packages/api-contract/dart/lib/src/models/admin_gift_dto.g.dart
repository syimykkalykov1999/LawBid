// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'admin_gift_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

AdminGiftDto _$AdminGiftDtoFromJson(Map<String, dynamic> json) => AdminGiftDto(
  id: json['id'] as String,
  title: json['title'] as String,
  priceStars: (json['priceStars'] as num).toInt(),
  fileId: json['fileId'] as String,
  url: json['url'] as String?,
  position: (json['position'] as num).toInt(),
  status: AdminGiftDtoStatus.fromJson(json['status'] as String),
  sentCount: (json['sentCount'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
);

Map<String, dynamic> _$AdminGiftDtoToJson(AdminGiftDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'title': instance.title,
      'priceStars': instance.priceStars,
      'fileId': instance.fileId,
      'url': ?instance.url,
      'position': instance.position,
      'status': instance.status.toJson(),
      'sentCount': instance.sentCount,
      'createdAt': instance.createdAt.toIso8601String(),
    };
