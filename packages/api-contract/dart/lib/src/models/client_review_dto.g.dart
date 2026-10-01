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
      'appealStatus': ?instance.appealStatus?.toJson(),
      'createdAt': instance.createdAt,
    };
