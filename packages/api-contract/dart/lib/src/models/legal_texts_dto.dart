// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'legal_texts_dto.g.dart';

@JsonSerializable()
class LegalTextsDto {
  const LegalTextsDto({
    required this.caseCreate,
    required this.attorneyUnverified,
    required this.supportNote,
    required this.partnerDisclosure,
    required this.partnerTerms,
    this.attorneyAdvertisingLabel,
    this.priorResultsDisclaimer,
    this.badgeExplainer,
    this.bestAnswerNote,
    this.translationNote,
    this.reviewReplyWarning,
    this.sponsoredLabel,
  });

  factory LegalTextsDto.fromJson(Map<String, Object?> json) =>
      _$LegalTextsDtoFromJson(json);

  final String caseCreate;
  final String attorneyUnverified;
  final String supportNote;
  final String partnerDisclosure;

  /// Plain text (no markdown), numbered rules.
  final String partnerTerms;

  /// Label next to attorney-created content (profile, post, bid, answer).
  final String? attorneyAdvertisingLabel;

  /// Prior-results disclaimer.
  final String? priorResultsDisclaimer;

  /// What the attorney badges mean (a registry check, not a recommendation).
  final String? badgeExplainer;

  /// Q&A note: the asker chooses the best answer.
  final String? bestAnswerNote;

  /// Note on machine translation.
  final String? translationNote;

  /// Warning for an attorney replying publicly to a review.
  final String? reviewReplyWarning;

  /// Label on paid placements.
  final String? sponsoredLabel;

  Map<String, Object?> toJson() => _$LegalTextsDtoToJson(this);
}
