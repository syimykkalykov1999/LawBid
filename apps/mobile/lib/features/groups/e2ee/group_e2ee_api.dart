import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// G2 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md §4.1): the group
/// scope of the Delivery Service (G1, #1384) as the app calls it, through
/// the generated `E2eeClient` ([ClientGroupE2eeApi]); an interface so the
/// tests run the service against an in-memory Delivery Service.
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
/// | [welcomes] | `GET /e2ee/groups/welcomes?deviceId=` |
abstract class GroupE2eeApi {
  Future<GroupE2eeState> state(String groupId);

  /// The first device makes the group's MLS group (epoch 0).
  Future<GroupE2eeState> createGroup(
    String groupId, {
    required String deviceId,
    required String mlsGroupId,
    String? groupInfo,
  });

  /// §4.4: the right to commit for `groups.e2ee_lease_ms`; false while
  /// another device holds it (that one's commit comes by `e2ee:commit`).
  Future<bool> lease(String groupId, String deviceId);

  /// KeyPackages of [deviceIds] (only for the holder of the lease).
  Future<List<GroupClaimedKeyPackage>> claim(
    String groupId,
    String deviceId,
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

  /// Group Welcomes waiting for [deviceId] (kept `chat.e2ee_welcome_keep_days`;
  /// there is no acknowledgement: a device skips the ones it is past).
  Future<List<GroupWelcome>> welcomes(String deviceId);
}

class GroupWelcome {
  const GroupWelcome({
    required this.groupId,
    required this.epoch,
    required this.welcome,
  });

  final String groupId;
  final int epoch;

  /// base64 MLSMessage Welcome.
  final String welcome;
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

/// The generated client of G1's endpoints.
class ClientGroupE2eeApi implements GroupE2eeApi {
  ClientGroupE2eeApi(this._c, {this.download, this.upload});

  final api.E2eeClient _c;

  /// The bytes behind a short link (a GroupInfo too big to be inline).
  final Stream<List<int>> Function(String url)? download;

  /// G2b: puts a GroupInfo above `groups.e2ee_group_info_inline_kb` into
  /// storage (the same direct upload as encrypted files, `chat_e2ee`); the
  /// file id goes in the commit instead (§4.3).
  final Future<String> Function(UploadBody body, api.FilePurpose purpose)?
      upload;

  /// Groups whose GroupInfo went as a file last time (it only grows with
  /// the group): the next one is uploaded first, no refused round trip.
  final Set<String> _bigInfo = {};

  static bool _useFile(DioException e) {
    final data = e.response?.data;
    final error = data is Map ? data['error'] : null;
    final details = error is Map ? error['details'] : null;
    return e.response?.statusCode == 400 &&
        details is Map &&
        details['why'] == 'use_file';
  }

  /// Sends [info] inline, or as an uploaded file when the server says it is
  /// above the inline limit (or it was last time).
  Future<T> _withInfo<T>(
    String groupId,
    String? info,
    Future<T> Function(String? inline, String? fileId) send,
  ) async {
    final put = upload;
    Future<T> asFile() async {
      final id = await put!(
        UploadBody.bytes(base64Decode(info!)),
        api.FilePurpose.chatE2ee,
      );
      _bigInfo.add(groupId);
      return send(null, id);
    }

    if (info == null || put == null) return send(info, null);
    if (_bigInfo.contains(groupId)) return asFile();
    try {
      return await send(info, null);
    } on DioException catch (e) {
      if (!_useFile(e)) rethrow;
      return asFile();
    }
  }

  static GroupE2eeState _state(api.GroupE2eeDto d) => GroupE2eeState(
        state: switch (d.state) {
          api.GroupE2eeState.valueOn => GroupE2eeMode.on,
          api.GroupE2eeState.pending => GroupE2eeMode.pending,
          _ => GroupE2eeMode.off,
        },
        groupId: d.groupId,
        epoch: d.epoch?.toInt(),
        devices: [
          for (final x in d.devices)
            GroupE2eeDevice(
              deviceId: x.deviceId,
              userId: x.userId,
              inGroup: x.inGroup,
            ),
        ],
        removeDevices: d.removeDevices,
        since: d.since,
        updateDays: d.updateDays.toInt(),
      );

  @override
  Future<GroupE2eeState> state(String groupId) async =>
      _state((await _c.getGroupE2ee(id: groupId)).data);

  @override
  Future<GroupE2eeState> createGroup(
    String groupId, {
    required String deviceId,
    required String mlsGroupId,
    String? groupInfo,
  }) =>
      _withInfo(
        groupId,
        groupInfo,
        (inline, fileId) async => _state(
          (await _c.createGroupMls(
            id: groupId,
            body: api.CreateGroupMlsDto(
              deviceId: deviceId,
              groupId: mlsGroupId,
              groupInfo: inline,
              groupInfoFileId: fileId,
            ),
          ))
              .data,
        ),
      );

  @override
  Future<bool> lease(String groupId, String deviceId) async =>
      (await _c.takeGroupMlsLease(
        id: groupId,
        body: api.GroupMlsLeaseDto(deviceId: deviceId),
      ))
          .data
          .granted;

  @override
  Future<List<GroupClaimedKeyPackage>> claim(
    String groupId,
    String deviceId,
    List<String> deviceIds,
  ) async =>
      [
        for (final c in (await _c.claimGroupMlsKeyPackages(
          id: groupId,
          body: api.GroupClaimKeyPackagesDto(
            deviceId: deviceId,
            deviceIds: deviceIds,
          ),
        ))
            .data)
          GroupClaimedKeyPackage(
            deviceId: c.deviceId,
            userId: c.userId,
            keyPackage: c.keyPackage,
          ),
      ];

  @override
  Future<int> postCommit(String groupId, GroupCommitBody body) => _withInfo(
        groupId,
        body.groupInfo,
        (inline, fileId) async => (await _c.postGroupMlsCommit(
          id: groupId,
          body: api.GroupMlsCommitDto(
            deviceId: body.deviceId,
            epoch: body.epoch,
            commit: body.commit,
            addedDevices: body.addedDevices,
            removedDevices: body.removedDevices,
            welcome: body.welcome,
            groupInfo: inline,
            groupInfoFileId: fileId,
          ),
        ))
            .data
            .epoch
            .toInt(),
      );

  @override
  Future<List<GroupCommitRow>> commits(String groupId, int after) async => [
        for (final r
            in (await _c.listGroupMlsCommits(id: groupId, after: after)).data)
          GroupCommitRow(epoch: r.epoch.toInt(), commit: r.commit),
      ];

  @override
  Future<GroupInfoRow?> groupInfo(String groupId) async {
    final api.GroupInfoResultDto r;
    try {
      r = (await _c.getGroupInfo(id: groupId)).data;
    } on DioException catch (e) {
      if (e.response?.statusCode == 404) return null;
      rethrow;
    }
    var info = r.groupInfo;
    final url = r.url;
    final get = download;
    if (info == null && url != null && get != null) {
      final bytes = BytesBuilder(copy: false);
      await for (final c in get(url)) {
        bytes.add(c);
      }
      info = base64Encode(bytes.takeBytes());
    }
    return info == null
        ? null
        : GroupInfoRow(epoch: r.epoch.toInt(), groupInfo: info);
  }

  @override
  Future<int> externalCommit(
    String groupId,
    GroupExternalCommitBody body,
  ) =>
      _withInfo(
        groupId,
        body.groupInfo,
        (inline, fileId) async => (await _c.postGroupExternalCommit(
          id: groupId,
          body: api.GroupExternalCommitDto(
            deviceId: body.deviceId,
            epoch: body.epoch,
            commit: body.commit,
            groupInfo: inline,
            groupInfoFileId: fileId,
            resync: body.resync,
          ),
        ))
            .data
            .epoch
            .toInt(),
      );

  @override
  Future<List<GroupWelcome>> welcomes(String deviceId) async => [
        for (final w
            in (await _c.listGroupMlsWelcomes(deviceId: deviceId)).data)
          GroupWelcome(
            groupId: w.groupId,
            epoch: w.epoch.toInt(),
            welcome: w.welcome,
          ),
      ];
}
