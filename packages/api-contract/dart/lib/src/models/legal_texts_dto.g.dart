// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'legal_texts_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

LegalTextsDto _$LegalTextsDtoFromJson(Map<String, dynamic> json) =>
    LegalTextsDto(
      caseCreate: json['caseCreate'] as String,
      attorneyUnverified: json['attorneyUnverified'] as String,
      supportNote: json['supportNote'] as String,
      partnerDisclosure: json['partnerDisclosure'] as String,
      partnerTerms: json['partnerTerms'] as String,
      privilegedContentPolicy: json['privilegedContentPolicy'] as String,
      attorneyAdvertisingLabel: json['attorneyAdvertisingLabel'] as String?,
      priorResultsDisclaimer: json['priorResultsDisclaimer'] as String?,
      badgeExplainer: json['badgeExplainer'] as String?,
      bestAnswerNote: json['bestAnswerNote'] as String?,
      translationNote: json['translationNote'] as String?,
      reviewReplyWarning: json['reviewReplyWarning'] as String?,
      sponsoredLabel: json['sponsoredLabel'] as String?,
    );

Map<String, dynamic> _$LegalTextsDtoToJson(LegalTextsDto instance) =>
    <String, dynamic>{
      'caseCreate': instance.caseCreate,
      'attorneyUnverified': instance.attorneyUnverified,
      'supportNote': instance.supportNote,
      'partnerDisclosure': instance.partnerDisclosure,
      'partnerTerms': instance.partnerTerms,
      'attorneyAdvertisingLabel': ?instance.attorneyAdvertisingLabel,
      'priorResultsDisclaimer': ?instance.priorResultsDisclaimer,
      'badgeExplainer': ?instance.badgeExplainer,
      'bestAnswerNote': ?instance.bestAnswerNote,
      'translationNote': ?instance.translationNote,
      'reviewReplyWarning': ?instance.reviewReplyWarning,
      'sponsoredLabel': ?instance.sponsoredLabel,
      'privilegedContentPolicy': instance.privilegedContentPolicy,
    };
