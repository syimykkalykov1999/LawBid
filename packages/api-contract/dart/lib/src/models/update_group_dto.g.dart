// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'update_group_dto.dart';

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

UpdateGroupDto _$UpdateGroupDtoFromJson(
  Map<String, dynamic> json,
) => UpdateGroupDto(
  title: json['title'] as String?,
  description: json['description'] as String?,
  avatarFileId: json['avatarFileId'] as String?,
  whoCanPost: json['whoCanPost'] == null
      ? null
      : UpdateGroupDtoWhoCanPost.fromJson(json['whoCanPost'] as String),
  whoCanAdd: json['whoCanAdd'] == null
      ? null
      : UpdateGroupDtoWhoCanAdd.fromJson(json['whoCanAdd'] as String),
  whoCanEditInfo: json['whoCanEditInfo'] == null
      ? null
      : UpdateGroupDtoWhoCanEditInfo.fromJson(json['whoCanEditInfo'] as String),
  whoCanCall: json['whoCanCall'] == null
      ? null
      : UpdateGroupDtoWhoCanCall.fromJson(json['whoCanCall'] as String),
  disappearAfterS: json['disappearAfterS'] == null
      ? null
      : UpdateGroupDtoDisappearAfterS.fromJson(json['disappearAfterS'] as num),
  whoCanMedia: json['whoCanMedia'] == null
      ? null
      : UpdateGroupDtoWhoCanMedia.fromJson(json['whoCanMedia'] as String),
  whoCanPoll: json['whoCanPoll'] == null
      ? null
      : UpdateGroupDtoWhoCanPoll.fromJson(json['whoCanPoll'] as String),
  whoCanPin: json['whoCanPin'] == null
      ? null
      : UpdateGroupDtoWhoCanPin.fromJson(json['whoCanPin'] as String),
  showServiceMessages: json['showServiceMessages'] as bool?,
  protectContent: json['protectContent'] as bool?,
  inviteEnabled: json['inviteEnabled'] as bool?,
  type: json['type'] == null
      ? null
      : GroupType.fromJson(json['type'] as String),
  username: json['username'] as String?,
  joinApproval: json['joinApproval'] as bool?,
  topicsEnabled: json['topicsEnabled'] as bool?,
);

Map<String, dynamic> _$UpdateGroupDtoToJson(UpdateGroupDto instance) =>
    <String, dynamic>{
      'title': ?instance.title,
      'description': ?instance.description,
      'avatarFileId': ?instance.avatarFileId,
      'whoCanPost': ?instance.whoCanPost?.toJson(),
      'whoCanAdd': ?instance.whoCanAdd?.toJson(),
      'whoCanEditInfo': ?instance.whoCanEditInfo?.toJson(),
      'whoCanCall': ?instance.whoCanCall?.toJson(),
      'disappearAfterS': ?instance.disappearAfterS?.toJson(),
      'whoCanMedia': ?instance.whoCanMedia?.toJson(),
      'whoCanPoll': ?instance.whoCanPoll?.toJson(),
      'whoCanPin': ?instance.whoCanPin?.toJson(),
      'showServiceMessages': ?instance.showServiceMessages,
      'protectContent': ?instance.protectContent,
      'inviteEnabled': ?instance.inviteEnabled,
      'type': ?instance.type?.toJson(),
      'username': ?instance.username,
      'joinApproval': ?instance.joinApproval,
      'topicsEnabled': ?instance.topicsEnabled,
    };
