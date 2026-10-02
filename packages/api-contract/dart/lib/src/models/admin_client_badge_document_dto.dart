// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:json_annotation/json_annotation.dart';

part 'admin_client_badge_document_dto.g.dart';

@JsonSerializable()
class AdminClientBadgeDocumentDto {
  const AdminClientBadgeDocumentDto({required this.fileId, this.url});

  factory AdminClientBadgeDocumentDto.fromJson(Map<String, Object?> json) =>
      _$AdminClientBadgeDocumentDtoFromJson(json);

  final String fileId;
  final String? url;

  Map<String, Object?> toJson() => _$AdminClientBadgeDocumentDtoToJson(this);
}
