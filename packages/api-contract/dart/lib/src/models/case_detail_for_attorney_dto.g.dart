// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'case_detail_for_attorney_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

CaseDetailForAttorneyDto _$CaseDetailForAttorneyDtoFromJson(
  Map<String, dynamic> json,
) => CaseDetailForAttorneyDto(
  isNew: json['isNew'] as bool,
  title: json['title'] as String,
  excerpt: json['excerpt'] as String,
  practiceArea: CasePracticeAreaDto.fromJson(
    json['practiceArea'] as Map<String, dynamic>,
  ),
  extraPracticeCount: (json['extraPracticeCount'] as num).toInt(),
  primaryStateCode: json['primaryStateCode'] as String,
  additionalStateCodes: (json['additionalStateCodes'] as List<dynamic>)
      .map((e) => e as String)
      .toList(),
  status: CaseStatus.fromJson(json['status'] as String),
  budget: CaseBudgetDto.fromJson(json['budget'] as Map<String, dynamic>),
  id: json['id'] as String,
  viewCount: (json['viewCount'] as num).toInt(),
  bidsCount: (json['bidsCount'] as num).toInt(),
  createdAt: DateTime.parse(json['createdAt'] as String),
  hasOwnBid: json['hasOwnBid'] as bool,
  commentCount: (json['commentCount'] as num).toInt(),
  shareCount: (json['shareCount'] as num).toInt(),
  isSaved: json['isSaved'] as bool,
  promoted: json['promoted'] as bool,
  bidAllowed: json['bidAllowed'] as bool,
  priorityClient: json['priorityClient'] as bool,
  dossier: CaseDossierDto.fromJson(json['dossier'] as Map<String, dynamic>),
  inMyPractice: json['inMyPractice'] as bool,
  privateDetails: json['privateDetails'] as String?,
  inMyLicensedStates: json['inMyLicensedStates'] as bool,
  acceptedBidIsMine: json['acceptedBidIsMine'] as bool,
  photosCount: json['photosCount'] as num,
  description: json['description'] as String,
  photos: (json['photos'] as List<dynamic>)
      .map((e) => CasePhotoDto.fromJson(e as Map<String, dynamic>))
      .toList(),
  clientActivity: json['clientActivity'] == null
      ? null
      : ClientActivityDto.fromJson(
          json['clientActivity'] as Map<String, dynamic>,
        ),
  ownBidId: json['ownBidId'] as String?,
  urgencyLevel: json['urgencyLevel'] == null
      ? null
      : CaseUrgencyLevel.fromJson(json['urgencyLevel'] as String),
  completionRequestedBy: json['completionRequestedBy'] == null
      ? null
      : CaseDetailForAttorneyDtoCompletionRequestedBy.fromJson(
          json['completionRequestedBy'] as String,
        ),
  deadlineKind: json['deadlineKind'] == null
      ? null
      : CaseDeadlineKind.fromJson(json['deadlineKind'] as String),
  deadlineAt: json['deadlineAt'] == null
      ? null
      : DateTime.parse(json['deadlineAt'] as String),
  urgency: json['urgency'] == null
      ? null
      : CaseUrgency.fromJson(json['urgency'] as String),
  coverKey: json['coverKey'] as String?,
  city: json['city'] as String?,
  promotedUntil: json['promotedUntil'] == null
      ? null
      : DateTime.parse(json['promotedUntil'] as String),
);

Map<String, dynamic> _$CaseDetailForAttorneyDtoToJson(
  CaseDetailForAttorneyDto instance,
) => <String, dynamic>{
  'id': instance.id,
  'title': instance.title,
  'excerpt': instance.excerpt,
  'practiceArea': instance.practiceArea.toJson(),
  'extraPracticeCount': instance.extraPracticeCount,
  'primaryStateCode': instance.primaryStateCode,
  'additionalStateCodes': instance.additionalStateCodes,
  'city': ?instance.city,
  'status': instance.status.toJson(),
  'budget': instance.budget.toJson(),
  'coverKey': ?instance.coverKey,
  'urgency': ?instance.urgency?.toJson(),
  'urgencyLevel': ?instance.urgencyLevel?.toJson(),
  'deadlineAt': ?instance.deadlineAt?.toIso8601String(),
  'deadlineKind': ?instance.deadlineKind?.toJson(),
  'viewCount': instance.viewCount,
  'bidsCount': instance.bidsCount,
  'createdAt': instance.createdAt.toIso8601String(),
  'isNew': instance.isNew,
  'hasOwnBid': instance.hasOwnBid,
  'commentCount': instance.commentCount,
  'shareCount': instance.shareCount,
  'isSaved': instance.isSaved,
  'promoted': instance.promoted,
  'promotedUntil': ?instance.promotedUntil?.toIso8601String(),
  'priorityClient': instance.priorityClient,
  'clientActivity': ?instance.clientActivity?.toJson(),
  'dossier': instance.dossier.toJson(),
  'description': instance.description,
  'ownBidId': ?instance.ownBidId,
  'acceptedBidIsMine': instance.acceptedBidIsMine,
  'completionRequestedBy': ?instance.completionRequestedBy?.toJson(),
  'photos': instance.photos.map((e) => e.toJson()).toList(),
  'photosCount': instance.photosCount,
  'privateDetails': ?instance.privateDetails,
  'inMyPractice': instance.inMyPractice,
  'inMyLicensedStates': instance.inMyLicensedStates,
  'bidAllowed': instance.bidAllowed,
};
