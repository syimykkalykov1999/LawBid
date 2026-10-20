// coverage:ignore-file
// GENERATED CODE - DO NOT MODIFY BY HAND
// ignore_for_file: type=lint, unused_import, invalid_annotation_target, unnecessary_import

import 'package:dio/dio.dart';
import 'package:retrofit/retrofit.dart';

import '../models/add_group_members_dto.dart';
import '../models/create_group_dto.dart';
import '../models/create_poll_dto.dart';
import '../models/create_topic_dto.dart';
import '../models/edit_group_message_dto.dart';
import '../models/group_detail_envelope.dart';
import '../models/group_envelope.dart';
import '../models/group_invite_preview_envelope.dart';
import '../models/group_invite_preview_list_envelope.dart';
import '../models/group_join_request_list_envelope.dart';
import '../models/group_join_result_envelope.dart';
import '../models/group_list_envelope.dart';
import '../models/group_message_envelope.dart';
import '../models/group_message_list_envelope.dart';
import '../models/group_read_result_envelope.dart';
import '../models/group_topic_envelope.dart';
import '../models/group_topic_list_envelope.dart';
import '../models/pin_group_message_dto.dart';
import '../models/poll_envelope.dart';
import '../models/poll_voter_option_list_envelope.dart';
import '../models/read_group_dto.dart';
import '../models/send_group_message_dto.dart';
import '../models/set_group_role_dto.dart';
import '../models/transfer_group_dto.dart';
import '../models/update_group_dto.dart';
import '../models/update_group_me_dto.dart';
import '../models/update_topic_dto.dart';
import '../models/vote_poll_dto.dart';

part 'groups_client.g.dart';

@RestApi()
abstract class GroupsClient {
  factory GroupsClient(Dio dio, {String? baseUrl}) = _GroupsClient;

  /// My groups, newest first (pinned lead page 1).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  ///
  /// [archived] - Owner 2026-10-20: true = only my archived groups; otherwise archived ones are left out.
  @GET('/groups')
  Future<GroupListEnvelope> listGroups({
    @Query('cursor') String? cursor,
    @Query('archived') bool? archived,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a group with the people picked
  @POST('/groups')
  Future<GroupDetailEnvelope> createGroup({
    @Body() required CreateGroupDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Recommended public groups for me (cached ranking, paged).
  ///
  /// [cursor] - Opaque cursor from nextCursor.
  @GET('/groups/discover')
  Future<GroupInvitePreviewListEnvelope> discoverGroups({
    @Query('limit') num? limit = 15,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Find public groups by title or @username
  @GET('/groups/search')
  Future<GroupInvitePreviewListEnvelope> searchPublicGroups({
    @Query('q') required String q,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Preview a group by its invite link code.
  ///
  /// [code] - The code from the invite link.
  @GET('/groups/join/{code}')
  Future<GroupInvitePreviewEnvelope> previewGroupInvite({
    @Path('code') required String code,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Join through the invite link / @username; a closed group with approval answers pending.
  ///
  /// [code] - The code from the invite link.
  @POST('/groups/join/{code}')
  Future<GroupJoinResultEnvelope> joinGroup({
    @Path('code') required String code,
    @Extras() Map<String, dynamic>? extras,
  });

  /// One group with its members
  @GET('/groups/{id}')
  Future<GroupDetailEnvelope> getGroup({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Title / photo / description (who may edit info) and rules / link (admins)
  @PATCH('/groups/{id}')
  Future<GroupDetailEnvelope> updateGroup({
    @Path('id') required String id,
    @Body() required UpdateGroupDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete the group (owner)
  @DELETE('/groups/{id}')
  Future<void> deleteGroupChat({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// New join link (the old one stops working)
  @POST('/groups/{id}/invite/reset')
  Future<GroupDetailEnvelope> resetGroupInvite({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Add people (admins, or everyone if the rule says)
  @POST('/groups/{id}/members')
  Future<GroupDetailEnvelope> addGroupMembers({
    @Path('id') required String id,
    @Body() required AddGroupMembersDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Remove a member (admins)
  @DELETE('/groups/{id}/members/{userId}')
  Future<GroupDetailEnvelope> removeGroupMember({
    @Path('id') required String id,
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Make an admin / take admin rights away (owner)
  @PUT('/groups/{id}/members/{userId}/role')
  Future<GroupDetailEnvelope> setGroupMemberRole({
    @Path('id') required String id,
    @Path('userId') required String userId,
    @Body() required SetGroupRoleDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Hand the group to another member (owner)
  @PUT('/groups/{id}/owner')
  Future<GroupDetailEnvelope> transferGroupOwner({
    @Path('id') required String id,
    @Body() required TransferGroupDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Leave the group
  @POST('/groups/{id}/leave')
  Future<void> leaveGroup({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Messages, newest first.
  ///
  /// [topicId] - Forum groups: only this topic («General» includes old chat).
  ///
  /// [cursor] - meta.nextCursor of the previous page.
  @GET('/groups/{id}/messages')
  Future<GroupMessageListEnvelope> listGroupMessages({
    @Path('id') required String id,
    @Query('limit') num? limit = 30,
    @Query('topicId') String? topicId,
    @Query('cursor') String? cursor,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Write to the group (idempotent on clientMessageId)
  @POST('/groups/{id}/messages')
  Future<GroupMessageEnvelope> sendGroupMessage({
    @Path('id') required String id,
    @Body() required SendGroupMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Edit my text message
  @PATCH('/groups/{id}/messages/{messageId}')
  Future<GroupMessageEnvelope> editGroupMessage({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Body() required EditGroupMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Delete for everyone (the author, or an admin)
  @DELETE('/groups/{id}/messages/{messageId}')
  Future<void> deleteGroupMessage({
    @Path('id') required String id,
    @Path('messageId') required String messageId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Pin a message (admins); messageId null unpins
  @PUT('/groups/{id}/pin')
  Future<GroupDetailEnvelope> pinGroupMessage({
    @Path('id') required String id,
    @Body() required PinGroupMessageDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Mark read up to a message
  @POST('/groups/{id}/read')
  Future<GroupReadResultEnvelope> readGroup({
    @Path('id') required String id,
    @Body() required ReadGroupDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// My mute / pin / hide of this chat
  @PATCH('/groups/{id}/me')
  Future<GroupEnvelope> updateMyGroupSettings({
    @Path('id') required String id,
    @Body() required UpdateGroupMeDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Join requests waiting for an admin
  @GET('/groups/{id}/requests')
  Future<GroupJoinRequestListEnvelope> listGroupJoinRequests({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Let the person in (admins)
  @POST('/groups/{id}/requests/{userId}/approve')
  Future<GroupJoinRequestListEnvelope> approveGroupJoinRequest({
    @Path('id') required String id,
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Turn the request down (admins)
  @POST('/groups/{id}/requests/{userId}/decline')
  Future<GroupJoinRequestListEnvelope> declineGroupJoinRequest({
    @Path('id') required String id,
    @Path('userId') required String userId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Topics of a forum group («General» first)
  @GET('/groups/{id}/topics')
  Future<GroupTopicListEnvelope> listGroupTopics({
    @Path('id') required String id,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a topic (admins)
  @POST('/groups/{id}/topics')
  Future<GroupTopicEnvelope> createGroupTopic({
    @Path('id') required String id,
    @Body() required CreateTopicDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Rename / recolor / close / pin a topic (admins)
  @PATCH('/groups/{id}/topics/{topicId}')
  Future<GroupTopicListEnvelope> updateGroupTopic({
    @Path('id') required String id,
    @Path('topicId') required String topicId,
    @Body() required UpdateTopicDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Create a poll (a message of type poll)
  @POST('/groups/{id}/polls')
  Future<GroupMessageEnvelope> createGroupPoll({
    @Path('id') required String id,
    @Body() required CreatePollDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Vote / revote; an empty list retracts
  @PUT('/groups/{id}/polls/{pollId}/vote')
  Future<PollEnvelope> voteGroupPoll({
    @Path('id') required String id,
    @Path('pollId') required String pollId,
    @Body() required VotePollDto body,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Close a poll (its author, or an admin)
  @POST('/groups/{id}/polls/{pollId}/close')
  Future<PollEnvelope> closeGroupPoll({
    @Path('id') required String id,
    @Path('pollId') required String pollId,
    @Extras() Map<String, dynamic>? extras,
  });

  /// Who voted for what (open polls only)
  @GET('/groups/{id}/polls/{pollId}/voters')
  Future<PollVoterOptionListEnvelope> listGroupPollVoters({
    @Path('id') required String id,
    @Path('pollId') required String pollId,
    @Extras() Map<String, dynamic>? extras,
  });
}
