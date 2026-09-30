// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'client_review_author_dto.dart';

part 'client_review_dto.g.dart';

@JsonSerializable()
class ClientReviewDto {
  const ClientReviewDto({
    required this.id,
    required this.caseId,
    required this.caseTitle,
    required this.rating,
    required this.attorney,
    required this.isMine,
    required this.createdAt,
    this.body,
  });

  factory ClientReviewDto.fromJson(Map<String, Object?> json) =>
      _$ClientReviewDtoFromJson(json);

  final String id;
  final String caseId;
  final String caseTitle;
  final int rating;
  final String? body;
  final ClientReviewAuthorDto attorney;
  final bool isMine;
  final String createdAt;

  Map<String, Object?> toJson() => _$ClientReviewDtoToJson(this);
}
