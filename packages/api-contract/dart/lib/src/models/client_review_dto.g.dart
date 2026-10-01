// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'client_review_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ClientReviewDto _$ClientReviewDtoFromJson(Map<String, dynamic> json) =>
    ClientReviewDto(
      id: json['id'] as String,
      rating: (json['rating'] as num).toInt(),
      attorney: ClientReviewAuthorDto.fromJson(
        json['attorney'] as Map<String, dynamic>,
      ),
      isMine: json['isMine'] as bool,
      canAppeal: json['canAppeal'] as bool,
      canReply: json['canReply'] as bool,
      reply: json['reply'] as String?,
      replyAt: json['replyAt'] == null
          ? null
          : DateTime.parse(json['replyAt'] as String),
      helpfulCount: (json['helpfulCount'] as num).toInt(),
      helpfulByMe: json['helpfulByMe'] as bool,
      editedAt: json['editedAt'] == null
          ? null
          : DateTime.parse(json['editedAt'] as String),
      photos: (json['photos'] as List<dynamic>)
          .map((e) => ReviewPhotoDto.fromJson(e as Map<String, dynamic>))
          .toList(),
      authorReviewCount: (json['authorReviewCount'] as num).toInt(),
      createdAt: json['createdAt'] as String,
      caseId: json['caseId'] as String?,
      caseTitle: json['caseTitle'] as String?,
      body: json['body'] as String?,
      appealStatus: json['appealStatus'] == null
          ? null
          : ReviewAppealStatus.fromJson(json['appealStatus'] as String),
    );

Map<String, dynamic> _$ClientReviewDtoToJson(ClientReviewDto instance) =>
    <String, dynamic>{
      'id': instance.id,
      'caseId': ?instance.caseId,
      'caseTitle': ?instance.caseTitle,
      'rating': instance.rating,
      'body': ?instance.body,
      'attorney': instance.attorney.toJson(),
      'isMine': instance.isMine,
      'canAppeal': instance.canAppeal,
      'canReply': instance.canReply,
      'reply': ?instance.reply,
      'replyAt': ?instance.replyAt?.toIso8601String(),
      'helpfulCount': instance.helpfulCount,
      'helpfulByMe': instance.helpfulByMe,
      'editedAt': ?instance.editedAt?.toIso8601String(),
      'photos': instance.photos.map((e) => e.toJson()).toList(),
      'authorReviewCount': instance.authorReviewCount,
      'appealStatus': ?instance.appealStatus?.toJson(),
      'createdAt': instance.createdAt,
    };
