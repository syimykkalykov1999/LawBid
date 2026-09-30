// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'client_review_author_dto.g.dart';

@JsonSerializable()
class ClientReviewAuthorDto {
  const ClientReviewAuthorDto({
    required this.id,
    required this.username,
    required this.displayName,
    required this.verifiedBadge,
    this.avatarUrl,
  });

  factory ClientReviewAuthorDto.fromJson(Map<String, Object?> json) =>
      _$ClientReviewAuthorDtoFromJson(json);

  final String id;
  final String username;
  final String displayName;
  final String? avatarUrl;
  final bool verifiedBadge;

  Map<String, Object?> toJson() => _$ClientReviewAuthorDtoToJson(this);
}
