// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

import 'admin_support_message_dto_author_type.dart';

part 'admin_support_message_dto.g.dart';

@JsonSerializable()
class AdminSupportMessageDto {
  const AdminSupportMessageDto({
    required this.id,
    required this.authorType,
    required this.authorId,
    required this.authorName,
    required this.internal,
    required this.body,
    required this.createdAt,
  });

  factory AdminSupportMessageDto.fromJson(Map<String, Object?> json) =>
      _$AdminSupportMessageDtoFromJson(json);

  final String id;
  final AdminSupportMessageDtoAuthorType authorType;
  final String authorId;
  final String authorName;
  final bool internal;
  final String body;
  final DateTime createdAt;

  Map<String, Object?> toJson() => _$AdminSupportMessageDtoToJson(this);
}
