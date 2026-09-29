import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// A user I blocked (`GET /users/me/blocks`, OQ-028).
@immutable
class BlockedUser {
  const BlockedUser({
    required this.id,
    required this.isAttorney,
    required this.blockedAt,
    this.username,
    this.firstName,
    this.lastName,
    this.avatarUrl,
  });

  final String id;
  final bool isAttorney;
  final String? username;
  final String? firstName;
  final String? lastName;
  final String? avatarUrl;
  final DateTime blockedAt;

  String get displayName {
    final name = [firstName, lastName].whereType<String>().join(' ').trim();
    if (name.isNotEmpty) return name;
    return username == null ? '' : '@$username';
  }
}

/// Owner decision 2026-09-29 (OQ-028): block / unblock any user.
/// Throws [ApiException].
abstract interface class BlocksRepository {
  Future<List<BlockedUser>> list();
  Future<void> block(String userId);
  Future<void> unblock(String userId);
}

class ApiBlocksRepository implements BlocksRepository {
  ApiBlocksRepository(Dio dio) : _client = api.BlocksClient(dio);

  final api.BlocksClient _client;

  @override
  Future<List<BlockedUser>> list() async =>
      (await guardApiCall(_client.listBlocks))
          .data
          .map(
            (d) => BlockedUser(
              id: d.id,
              isAttorney: d.role == api.PersonRole.attorney,
              username: d.username,
              firstName: d.firstName,
              lastName: d.lastName,
              avatarUrl: d.avatarUrl,
              blockedAt: DateTime.tryParse(d.blockedAt) ?? DateTime.now(),
            ),
          )
          .toList(growable: false);

  @override
  Future<void> block(String userId) =>
      guardApiCall(() => _client.block(id: userId));

  @override
  Future<void> unblock(String userId) =>
      guardApiCall(() => _client.unblock(id: userId));
}
