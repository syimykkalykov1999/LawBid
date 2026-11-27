import 'package:dio/dio.dart';

/// G2 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md §4.1): the group
/// scope of the Delivery Service, as the app calls it. The server side (G1)
/// is the same Delivery Service as the chats' with `scope = group`; these
/// are the endpoints of the design's table. Until G1's contract is
/// regenerated into `lawbid_api` the calls go through [DioGroupE2eeApi]
/// (plain JSON, the same envelope `{data: …}` as every endpoint); switching
/// to the generated client changes only that class.
///
/// | Call | Endpoint |
/// |---|---|
/// | [state] | `GET /e2ee/groups/:id` |
/// | [createGroup] | `POST /e2ee/groups/:id/group` |
/// | [lease] | `POST /e2ee/groups/:id/lease` |
/// | [claim] | `POST /e2ee/groups/:id/key-packages/claim` |
/// | [postCommit] | `POST /e2ee/groups/:id/commits` |
/// | [commits] | `GET /e2ee/groups/:id/commits?after=` |
/// | [groupInfo] | `GET /e2ee/groups/:id/group-info` |
/// | [externalCommit] | `POST /e2ee/groups/:id/external-commit` |
abstract class GroupE2eeApi {
  Future<GroupE2eeState> state(String groupId);

  /// The first device makes the group's MLS group (epoch 0).
  Future<GroupE2eeState> createGroup(
    String groupId, {
    required String deviceId,
    required String mlsGroupId,
  });

  /// §4.4: the right to commit for `groups.e2ee_lease_ms`; false while
  /// another device holds it (that one's commit comes by `e2ee:commit`).
  Future<bool> lease(String groupId, String deviceId);

  /// KeyPackages of [deviceIds] (only for the holder of the lease).
  Future<List<GroupClaimedKeyPackage>> claim(
    String groupId,
    List<String> deviceIds,
  );

  /// A commit at [GroupCommitBody.epoch]; 409 `E2EE_EPOCH_CONFLICT` when
  /// another one took it. The new epoch.
  Future<int> postCommit(String groupId, GroupCommitBody body);

  /// The accepted commits from epoch [after] on (oldest first).
  Future<List<GroupCommitRow>> commits(String groupId, int after);

  /// The newest GroupInfo (with the ratchet tree), null when none.
  Future<GroupInfoRow?> groupInfo(String groupId);

  /// This device's external commit (join / resync); 403 when its person is
  /// not a member, 409 when another commit took the epoch. The new epoch.
  Future<int> externalCommit(String groupId, GroupExternalCommitBody body);
}

enum GroupE2eeMode { off, pending, on }

class GroupE2eeDevice {
  const GroupE2eeDevice({
    required this.deviceId,
    required this.userId,
    required this.inGroup,
  });

  factory GroupE2eeDevice.fromJson(Map<String, dynamic> j) => GroupE2eeDevice(
        deviceId: j['deviceId'] as String,
        userId: j['userId'] as String,
        inGroup: j['inGroup'] == true,
      );

  final String deviceId;
  final String userId;
  final bool inGroup;

  Map<String, Object?> toJson() => {
        'deviceId': deviceId,
        'userId': userId,
        'inGroup': inGroup,
      };
}

/// `GET /e2ee/groups/:id`: the group's encryption as the server sees it.
class GroupE2eeState {
  const GroupE2eeState({
    required this.state,
    this.groupId,
    this.epoch,
    this.devices = const [],
    this.removeDevices = const [],
    this.since,
    this.updateDays = 7,
  });

  factory GroupE2eeState.fromJson(Map<String, dynamic> j) => GroupE2eeState(
        state: switch (j['state']) {
          'on' => GroupE2eeMode.on,
          'pending' => GroupE2eeMode.pending,
          _ => GroupE2eeMode.off,
        },
        groupId: j['groupId'] as String?,
        epoch: (j['epoch'] as num?)?.toInt(),
        devices: [
          for (final d in (j['devices'] as List?) ?? const [])
            GroupE2eeDevice.fromJson(Map<String, dynamic>.from(d as Map)),
        ],
        removeDevices: [
          for (final d in (j['removeDevices'] as List?) ?? const [])
            d as String,
        ],
        since:
            j['since'] == null ? null : DateTime.tryParse(j['since'] as String),
        // `groups.e2ee_update_days` (admin setting): 0 = no planned update.
        updateDays: (j['updateDays'] as num?)?.toInt() ?? 7,
      );

  /// off: plain as before (`groups.e2ee_mode` Выкл, a public group with
  /// `groups.e2ee_public` off, the demo world); pending: every member can
  /// read encrypted, the next send starts it; on: only `type = mls`.
  final GroupE2eeMode state;

  /// base64 of the MLS group id (`lawbid:g:<groupId>`).
  final String? groupId;
  final int? epoch;
  final List<GroupE2eeDevice> devices;

  /// Devices that must leave the MLS group before anyone writes.
  final List<String> removeDevices;

  /// `chat_groups.e2ee_since`.
  final DateTime? since;
  final int updateDays;
}

class GroupClaimedKeyPackage {
  const GroupClaimedKeyPackage({
    required this.deviceId,
    required this.userId,
    this.keyPackage,
  });

  factory GroupClaimedKeyPackage.fromJson(Map<String, dynamic> j) =>
      GroupClaimedKeyPackage(
        deviceId: j['deviceId'] as String,
        userId: j['userId'] as String,
        keyPackage: j['keyPackage'] as String?,
      );

  final String deviceId;
  final String userId;

  /// base64 MLSMessage; null when the device has none left.
  final String? keyPackage;
}

/// The commit «package» (Wire): commit + Welcome + GroupInfo of the new
/// epoch, accepted together.
class GroupCommitBody {
  const GroupCommitBody({
    required this.deviceId,
    required this.epoch,
    required this.commit,
    required this.groupInfo,
    this.addedDevices = const [],
    this.removedDevices = const [],
    this.welcome,
  });

  final String deviceId;
  final int epoch;
  final String commit;
  final String groupInfo;
  final List<String> addedDevices;
  final List<String> removedDevices;
  final String? welcome;

  Map<String, Object?> toJson() => {
        'deviceId': deviceId,
        'epoch': epoch,
        'commit': commit,
        'groupInfo': groupInfo,
        'addedDevices': addedDevices,
        'removedDevices': removedDevices,
        if (welcome != null) 'welcome': welcome,
      };
}

class GroupExternalCommitBody {
  const GroupExternalCommitBody({
    required this.deviceId,
    required this.epoch,
    required this.commit,
    required this.groupInfo,
    this.resync = false,
  });

  final String deviceId;
  final int epoch;
  final String commit;
  final String groupInfo;

  /// RFC 9420 §12.4.3.2: the commit also removes this device's old leaf.
  final bool resync;

  Map<String, Object?> toJson() => {
        'deviceId': deviceId,
        'epoch': epoch,
        'commit': commit,
        'groupInfo': groupInfo,
        'resync': resync,
      };
}

class GroupCommitRow {
  const GroupCommitRow({required this.epoch, required this.commit});

  factory GroupCommitRow.fromJson(Map<String, dynamic> j) => GroupCommitRow(
        epoch: (j['epoch'] as num).toInt(),
        commit: j['commit'] as String,
      );

  final int epoch;
  final String commit;
}

class GroupInfoRow {
  const GroupInfoRow({required this.epoch, required this.groupInfo});

  factory GroupInfoRow.fromJson(Map<String, dynamic> j) => GroupInfoRow(
        epoch: (j['epoch'] as num).toInt(),
        groupInfo: j['groupInfo'] as String,
      );

  final int epoch;

  /// base64 MLSMessage GroupInfo.
  final String groupInfo;
}

class DioGroupE2eeApi implements GroupE2eeApi {
  DioGroupE2eeApi(this._dio);

  final Dio _dio;

  static Object? _data(Response<Object?> r) {
    final body = r.data;
    return body is Map ? body['data'] : null;
  }

  static Map<String, dynamic> _map(Response<Object?> r) =>
      Map<String, dynamic>.from(_data(r)! as Map);

  @override
  Future<GroupE2eeState> state(String groupId) async => GroupE2eeState.fromJson(
        _map(await _dio.get<Object?>('/e2ee/groups/$groupId')),
      );

  @override
  Future<GroupE2eeState> createGroup(
    String groupId, {
    required String deviceId,
    required String mlsGroupId,
  }) async =>
      GroupE2eeState.fromJson(
        _map(
          await _dio.post<Object?>(
            '/e2ee/groups/$groupId/group',
            data: {'deviceId': deviceId, 'groupId': mlsGroupId},
          ),
        ),
      );

  @override
  Future<bool> lease(String groupId, String deviceId) async {
    final r = await _dio.post<Object?>(
      '/e2ee/groups/$groupId/lease',
      data: {'deviceId': deviceId},
    );
    return _map(r)['granted'] == true;
  }

  @override
  Future<List<GroupClaimedKeyPackage>> claim(
    String groupId,
    List<String> deviceIds,
  ) async {
    final r = await _dio.post<Object?>(
      '/e2ee/groups/$groupId/key-packages/claim',
      data: {'deviceIds': deviceIds},
    );
    return [
      for (final c in (_data(r) as List?) ?? const [])
        GroupClaimedKeyPackage.fromJson(Map<String, dynamic>.from(c as Map)),
    ];
  }

  @override
  Future<int> postCommit(String groupId, GroupCommitBody body) async {
    final r = await _dio.post<Object?>(
      '/e2ee/groups/$groupId/commits',
      data: body.toJson(),
    );
    return (_map(r)['epoch'] as num).toInt();
  }

  @override
  Future<List<GroupCommitRow>> commits(String groupId, int after) async {
    final r = await _dio.get<Object?>(
      '/e2ee/groups/$groupId/commits',
      queryParameters: {'after': after},
    );
    return [
      for (final c in (_data(r) as List?) ?? const [])
        GroupCommitRow.fromJson(Map<String, dynamic>.from(c as Map)),
    ];
  }

  @override
  Future<GroupInfoRow?> groupInfo(String groupId) async {
    try {
      final r = await _dio.get<Object?>('/e2ee/groups/$groupId/group-info');
      final d = _data(r);
      return d is Map
          ? GroupInfoRow.fromJson(Map<String, dynamic>.from(d))
          : null;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
  }

  @override
  Future<int> externalCommit(
    String groupId,
    GroupExternalCommitBody body,
  ) async {
    final r = await _dio.post<Object?>(
      '/e2ee/groups/$groupId/external-commit',
      data: body.toJson(),
    );
    return (_map(r)['epoch'] as num).toInt();
  }
}
