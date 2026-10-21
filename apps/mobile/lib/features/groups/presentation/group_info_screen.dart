import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/domain/disappearing.dart';
import 'package:lawbid/features/chat/presentation/disappearing_sheet.dart';
import 'package:lawbid/features/groups/application/group_call_port.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/groups/presentation/group_files_screen.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_admin_rights_sheet.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_avatar.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_header.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_link.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_member_tile.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_requests.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_section.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_settings.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_topics.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_invited_tile.dart';
import 'package:lawbid/features/groups/presentation/widgets/people_picker.dart';
import 'package:lawbid/features/notifications/application/call_mute.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

enum _MemberAction { makeAdmin, rights, removeAdmin, transfer, remove }

enum _Mute { hour, eightHours, days2, forever, off }

/// Owner 2026-10-20: «Group info» (Telegram + WhatsApp): photo, title,
/// description, mute, the admin settings, the invite link, join requests,
/// members, topics and the leave / delete zone, on one scrollable screen.
class GroupInfoScreen extends ConsumerStatefulWidget {
  const GroupInfoScreen({required this.groupId, super.key});

  final String groupId;

  @override
  ConsumerState<GroupInfoScreen> createState() => _GroupInfoScreenState();
}

class _GroupInfoScreenState extends ConsumerState<GroupInfoScreen> {
  /// The newest detail an action returned; shown at once, dropped as soon
  /// as the provider has re-read the group.
  api.GroupDetailDto? _fresh;

  /// My own mute as the server answered it, until the provider catches up.
  ({DateTime? until})? _mute;

  /// My «mute calls» as the server answered it, until the provider catches up.
  bool? _callsMuted;

  bool _photoBusy = false;

  /// Leaving / deleting is in flight.
  bool _leaving = false;

  /// The group is gone or I am no longer in it.
  bool _gone = false;
  StreamSubscription<Object?>? _events;

  String get _id => widget.groupId;

  @override
  void initState() {
    super.initState();
    _events = ref.read(realtimeEventsProvider).listen((e) {
      final data = e.data;
      if (e.name == 'group:member_removed' &&
          data is Map &&
          data['groupId'] == _id &&
          !_leaving &&
          mounted) {
        setState(() => _gone = true);
      }
    });
  }

  @override
  void dispose() {
    unawaited(_events?.cancel());
    super.dispose();
  }

  void _toast(String message) {
    if (mounted) showAppSnackBar(context, message);
  }

  /// A request failed because the group is gone / I am out of it.
  bool _notMine(Object e) =>
      e is ApiException &&
      (e.code == ApiErrorCodes.groupNotFound ||
          e.code == ApiErrorCodes.groupForbidden);

  void _refresh() => ref
    ..invalidate(groupDetailProvider(_id))
    ..invalidate(groupsProvider);

  /// Runs a group change; returns the error text to show, or null on success
  /// (the screen takes the returned detail at once).
  Future<String?> _update(api.UpdateGroupDto change) async {
    final t = ref.read(translatorProvider);
    try {
      final d = await ref.read(groupRepositoryProvider).update(_id, change);
      if (!mounted) return null;
      setState(() => _fresh = d);
      _refresh();
      return null;
    } on Object catch (e) {
      if (mounted &&
          e is ApiException &&
          e.code == ApiErrorCodes.groupNotFound) {
        setState(() => _gone = true);
      }
      return errorText(t, e);
    }
  }

  /// Runs [call] (a members / role change returning the new detail) and
  /// shows the error, if any.
  Future<api.GroupDetailDto?> _change(
    Future<api.GroupDetailDto> Function() call,
  ) async {
    final t = ref.read(translatorProvider);
    try {
      final d = await call();
      if (!mounted) return null;
      setState(() => _fresh = d);
      _refresh();
      return d;
    } on Object catch (e) {
      if (mounted &&
          e is ApiException &&
          e.code == ApiErrorCodes.groupNotFound) {
        setState(() => _gone = true);
      } else {
        _toast(errorText(t, e));
      }
    }
    return null;
  }

  // --- photo ----------------------------------------------------------------

  Future<void> _editPhoto(api.GroupDetailDto d) async {
    final t = ref.read(translatorProvider);
    final choice = await showGroupPhotoSheet(
      context,
      t: t,
      hasPhoto: d.avatarUrl != null,
    );
    if (choice == null || !mounted) return;
    if (choice == GroupPhotoChoice.remove) {
      setState(() => _photoBusy = true);
      try {
        await removeGroupPhoto(ref, _id);
        if (mounted) _refresh();
      } on Object catch (e) {
        _toast(errorText(t, e));
      } finally {
        if (mounted) setState(() => _photoBusy = false);
      }
      return;
    }
    Uint8List? bytes;
    try {
      bytes = await pickGroupPhoto(ref, choice);
    } on Object {
      _toast(t.t('profile.photo.pickFailed'));
      return;
    }
    if (bytes == null || !mounted) return;
    setState(() => _photoBusy = true);
    try {
      final fileId = await uploadGroupPhoto(ref, bytes);
      if (!mounted) return;
      final error = await _update(api.UpdateGroupDto(avatarFileId: fileId));
      if (error != null) _toast(error);
    } on Object catch (e) {
      _toast(errorText(t, e));
    } finally {
      if (mounted) setState(() => _photoBusy = false);
    }
  }

  // --- text -----------------------------------------------------------------

  Future<void> _editTitle(api.GroupDetailDto d) async {
    final t = ref.read(translatorProvider);
    await showGroupTextSheet(
      context,
      title: t.t('group.info.editTitle'),
      initial: d.title,
      maxLength: 80,
      hint: t.t('group.info.titleHint'),
      submit: (v) => _update(api.UpdateGroupDto(title: v)),
    );
  }

  Future<void> _editDescription(api.GroupDetailDto d) async {
    final t = ref.read(translatorProvider);
    await showGroupTextSheet(
      context,
      title: t.t('group.info.editDescription'),
      initial: d.description ?? '',
      maxLength: 500,
      maxLines: 5,
      allowEmpty: true,
      hint: t.t('group.info.descriptionHint'),
      submit: (v) => _update(api.UpdateGroupDto(description: v)),
    );
  }

  // --- mute -----------------------------------------------------------------

  Future<void> _setCallsMuted(
    api.GroupDetailDto d, {
    required bool muted,
  }) async {
    final t = ref.read(translatorProvider);
    setState(() => _callsMuted = muted);
    ref.read(callMutedChatsProvider.notifier).mark(_id, muted: muted);
    try {
      await ref
          .read(groupRepositoryProvider)
          .updateMine(_id, api.UpdateGroupMeDto(callsMuted: muted));
      if (mounted) _refresh();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _callsMuted = !muted);
      _toast(errorText(t, e));
    }
  }

  DateTime? _mutedUntil(api.GroupDetailDto d) =>
      _mute != null ? _mute!.until : d.mutedUntil;

  bool _isMuted(api.GroupDetailDto d) =>
      _mutedUntil(d)?.isAfter(DateTime.now()) ?? false;

  Future<void> _openMute(api.GroupDetailDto d) async {
    final t = ref.read(translatorProvider);
    final muted = _isMuted(d);
    final pick = await showGroupChoiceSheet<_Mute>(
      context,
      title: t.t('group.info.mute.title'),
      choices: [
        if (muted)
          GroupChoice(
            value: _Mute.off,
            label: t.t('group.info.mute.off'),
            icon: AppIcons.notificationsActiveOutlined,
          ),
        GroupChoice(value: _Mute.hour, label: t.t('group.info.mute.hour')),
        GroupChoice(
          value: _Mute.eightHours,
          label: t.t('group.info.mute.hours8'),
        ),
        GroupChoice(value: _Mute.days2, label: t.t('group.info.mute.days2')),
        GroupChoice(
          value: _Mute.forever,
          label: t.t('group.info.mute.forever'),
        ),
      ],
    );
    if (pick == null || !mounted) return;
    final now = DateTime.now().toUtc();
    // The API has no «null» for this field, so «unmute» is a time already
    // gone (the server only compares it with now).
    final until = switch (pick) {
      _Mute.hour => now.add(const Duration(hours: 1)),
      _Mute.eightHours => now.add(const Duration(hours: 8)),
      _Mute.days2 => now.add(const Duration(days: 2)),
      _Mute.forever => DateTime.utc(2100),
      _Mute.off => now.subtract(const Duration(minutes: 1)),
    };
    try {
      final g = await ref
          .read(groupRepositoryProvider)
          .updateMine(_id, api.UpdateGroupMeDto(mutedUntil: until));
      if (!mounted) return;
      setState(() => _mute = (until: g.mutedUntil));
      _refresh();
      _toast(
        t.t(
          pick == _Mute.off
              ? 'group.info.mute.unmuted'
              : 'group.info.mute.muted',
        ),
      );
    } on Object catch (e) {
      _toast(errorText(t, e));
    }
  }

  // --- members --------------------------------------------------------------

  Future<void> _addMembers(api.GroupDetailDto d) async {
    final t = ref.read(translatorProvider);
    final picked = await showPeoplePicker(
      context,
      excludeIds: {
        for (final m in d.members) m.userId,
        for (final m in d.invited) m.userId,
      },
      titleKey: 'group.inv.addTitle',
    );
    if (picked == null || picked.isEmpty || !mounted) return;
    final d2 = await _change(
      () => ref
          .read(groupRepositoryProvider)
          .addMembers(_id, [for (final p in picked) p.userId]),
    );
    if (mounted && d2 != null) {
      // Owner 2026-10-21: nobody is put in; the people are invited. The
      // invited list is the truth: someone already in, or refused by their
      // privacy settings, never shows up there.
      final sent = (d2.invited.length - d.invited.length).clamp(0, 1 << 20);
      final skipped = d2.notAdded?.length ?? 0;
      _toast(
        [
          if (sent > 0) t.t('group.inv.toast', {'count': context.digits(sent)}),
          if (skipped > 0)
            t.t('group.info.notAdded', {'count': context.digits(skipped)}),
        ].join('. '),
      );
    }
  }

  /// [actions] as one row, or two balanced rows when there are over four.
  List<List<Widget>> _rows(List<Widget> actions) {
    if (actions.length <= 4) return [actions];
    final n = (actions.length + 1) ~/ 2;
    return [actions.sublist(0, n), actions.sublist(n)];
  }

  /// Audio / video call to the group (the calls feature runs it; the
  /// audio mesh holds 6, the video one 4).
  Future<void> _startCall(
    api.GroupDetailDto d,
    Translator t, {
    required bool video,
  }) async {
    final port = ref.read(groupCallPortProvider);
    if (port == null) return;
    final me = ref.read(currentUserIdProvider);
    final others = [
      for (final m in d.members)
        if (m.userId != me) m.userId,
    ].take(video ? 3 : 5).toList();
    final code = await port.start(
      d.id,
      title: d.title,
      avatarUrl: d.avatarUrl,
      video: video,
      userIds: others,
    );
    if (code != null) _toast(t.t('error.api.$code'));
  }

  /// «Administrators»: the owner and the admins; the owner opens the
  /// checkboxes of an admin from here.
  Future<void> _openAdmins(api.GroupDetailDto d, Translator t) async {
    final owner = d.myRole == api.GroupRole.owner;
    final admins = [
      for (final m in d.members)
        if (m.role != api.GroupRole.member) m,
    ];
    final pick = await showGroupChoiceSheet<api.GroupMemberDto>(
      context,
      title: t.t('channel.admins'),
      choices: [
        for (final m in admins)
          GroupChoice(
            value: m,
            label: m.displayName ?? m.username ?? t.t('group.someone'),
            icon: m.role == api.GroupRole.owner
                ? AppIcons.verifiedUserOutlined
                : AppIcons.adminPanelSettingsOutlined,
          ),
      ],
    );
    if (pick == null || !mounted || !owner) return;
    if (pick.role == api.GroupRole.owner) return;
    await _memberMenu(d, pick, t);
  }

  Future<void> _memberMenu(
    api.GroupDetailDto d,
    api.GroupMemberDto m,
    Translator t,
  ) async {
    final iAmOwner = d.myRole == api.GroupRole.owner;
    final isAdmin = m.role == api.GroupRole.admin;
    final action = await showGroupChoiceSheet<_MemberAction>(
      context,
      title: m.displayName ?? m.username ?? t.t('group.someone'),
      choices: [
        if (d.canAppoint && !isAdmin)
          GroupChoice(
            value: _MemberAction.makeAdmin,
            label: t.t('group.info.member.makeAdmin'),
            icon: AppIcons.adminPanelSettingsOutlined,
          ),
        if (iAmOwner && isAdmin) ...[
          GroupChoice(
            value: _MemberAction.rights,
            label: t.t('group.info.member.rights'),
            icon: AppIcons.adminPanelSettingsOutlined,
          ),
          GroupChoice(
            value: _MemberAction.removeAdmin,
            label: t.t('group.info.member.removeAdmin'),
            icon: AppIcons.personOffOutlined,
          ),
        ],
        if (iAmOwner)
          GroupChoice(
            value: _MemberAction.transfer,
            label: t.t('group.info.member.transfer'),
            icon: AppIcons.groupsOutlined,
          ),
        if (d.canBanMembers)
          GroupChoice(
            value: _MemberAction.remove,
            label: t.t('group.info.member.remove'),
            icon: AppIcons.removeCircleOutlineRounded,
            destructive: true,
          ),
      ],
    );
    if (action == null || !mounted) return;
    switch (action) {
      case _MemberAction.makeAdmin:
      case _MemberAction.rights:
        final name = m.displayName ?? m.username ?? t.t('group.someone');
        final iAmOwnerNow = d.myRole == api.GroupRole.owner;
        final rights = await showGroupAdminRightsSheet(
          context,
          name: name,
          allowed: iAmOwnerNow
              ? kGroupAdminRights
              : [
                  for (final r in kGroupAdminRights)
                    if (d.hasRight(r)) r,
                ],
          initial: action == _MemberAction.rights
              ? [for (final r in m.rights) r.json!]
              : const ['info', 'delete', 'ban', 'invite', 'pin', 'calls'],
        );
        if (rights == null || !mounted) return;
        await _change(
          () => ref.read(groupRepositoryProvider).setRole(
                _id,
                m.userId,
                api.SetGroupRoleDtoRole.admin,
                rights: rights,
              ),
        );
      case _MemberAction.removeAdmin:
        await _change(
          () => ref
              .read(groupRepositoryProvider)
              .setRole(_id, m.userId, api.SetGroupRoleDtoRole.member),
        );
      case _MemberAction.transfer:
        final name = m.displayName ?? m.username ?? t.t('group.someone');
        final ok = await confirmGroupAction(
          context,
          title: t.t('group.info.member.transferTitle', {'name': name}),
          message: t.t('group.info.member.transferBody', {'name': name}),
          confirmLabel: t.t('group.info.member.transfer'),
          cancelLabel: t.t('common.cancel'),
        );
        if (!ok || !mounted) return;
        await _change(
          () => ref.read(groupRepositoryProvider).transferOwner(_id, m.userId),
        );
      case _MemberAction.remove:
        final name = m.displayName ?? m.username ?? t.t('group.someone');
        final ok = await confirmGroupAction(
          context,
          title: t.t('group.info.member.removeTitle', {'name': name}),
          message: t.t('group.info.member.removeBody'),
          confirmLabel: t.t('group.info.member.remove'),
          cancelLabel: t.t('common.cancel'),
          destructive: true,
        );
        if (!ok || !mounted) return;
        await _change(
          () => ref.read(groupRepositoryProvider).removeMember(_id, m.userId),
        );
    }
  }

  /// Whether [m] has a menu for me: not me, never the owner; removing
  /// needs «ban», appointing needs «admins» (an admin's rights are the
  /// owner's to change).
  bool _canManage(api.GroupDetailDto d, api.GroupMemberDto m, String? me) {
    if (m.userId == me || m.role == api.GroupRole.owner) return false;
    final owner = d.myRole == api.GroupRole.owner;
    if (owner) return true;
    if (m.role == api.GroupRole.admin) return false;
    return d.canBanMembers || d.canAppoint;
  }

  void _openProfile(api.GroupMemberDto m) {
    final username = m.username;
    if (username == null) return;
    unawaited(
      context.push(
        m.kind == api.GroupMemberDtoKind.attorney
            ? AppRoutes.lawyer(username)
            : AppRoutes.client(username),
      ),
    );
  }

  // --- leave / delete -------------------------------------------------------

  void _toInbox() {
    ref.invalidate(groupsProvider);
    context.go(ChatRoutes.inbox);
  }

  Future<void> _leave(api.GroupDetailDto d, Translator t) async {
    final isOwner = d.myRole == api.GroupRole.owner;
    final ok = await confirmGroupAction(
      context,
      title: t.t('group.info.leave.title'),
      message:
          t.t(isOwner ? 'group.info.leave.bodyOwner' : 'group.info.leave.body'),
      confirmLabel: t.t('group.info.leave.confirm'),
      cancelLabel: t.t('common.cancel'),
      destructive: true,
    );
    if (!ok || !mounted) return;
    setState(() => _leaving = true);
    try {
      await ref.read(groupRepositoryProvider).leave(_id);
      if (mounted) _toInbox();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _leaving = false);
      if (_notMine(e)) {
        setState(() => _gone = true);
      } else {
        _toast(errorText(t, e));
      }
    }
  }

  Future<void> _delete(Translator t) async {
    final first = await confirmGroupAction(
      context,
      title: t.t('group.info.delete.title'),
      message: t.t('group.info.delete.body'),
      confirmLabel: t.t('group.info.delete.confirm'),
      cancelLabel: t.t('common.cancel'),
      destructive: true,
    );
    if (!first || !mounted) return;
    final second = await confirmGroupAction(
      context,
      title: t.t('group.info.delete.title2'),
      message: t.t('group.info.delete.body2'),
      confirmLabel: t.t('group.info.delete.confirm2'),
      cancelLabel: t.t('common.cancel'),
      destructive: true,
    );
    if (!second || !mounted) return;
    setState(() => _leaving = true);
    try {
      await ref.read(groupRepositoryProvider).deleteGroup(_id);
      if (mounted) _toInbox();
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _leaving = false);
      if (_notMine(e)) {
        setState(() => _gone = true);
      } else {
        _toast(errorText(t, e));
      }
    }
  }

  // --- build ----------------------------------------------------------------

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    ref.listen(groupDetailProvider(_id), (_, next) {
      if (next.hasValue &&
          !next.isLoading &&
          (_fresh != null || _mute != null)) {
        setState(() {
          _fresh = null;
          _mute = null;
        });
      }
    });
    final async = ref.watch(groupDetailProvider(_id));
    final detail = _fresh ?? async.value;

    final back = AppBackButton(
      semanticLabel: t.t('common.back'),
      onPressed: () {
        if (context.canPop()) {
          context.pop();
        } else {
          context.go(ChatRoutes.inbox);
        }
      },
    );

    Widget body;
    if (_gone || (detail == null && async.hasError && _notMine(async.error!))) {
      body = AppStateLayout(
        icon: AppIcons.groupsOutlined,
        message: t.t('group.info.gone'),
        action: AppButton(
          label: t.t('group.info.toInbox'),
          height: AppSizes.touchTarget,
          onPressed: _toInbox,
        ),
      );
    } else if (detail == null) {
      body = async.hasError
          ? CasesErrorView(
              error: async.error!,
              t: t,
              onRetry: () => ref.invalidate(groupDetailProvider(_id)),
            )
          : const Center(child: CircularProgressIndicator(strokeWidth: 2));
    } else {
      body = _content(detail, t);
    }

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(leading: back, title: Text(t.t('group.info.title'))),
      body: body,
    );
  }

  Widget _content(api.GroupDetailDto d, Translator t) {
    final me = ref.watch(currentUserIdProvider);
    final muted = _isMuted(d);
    final closedWithApproval = d.type == api.GroupType.closed && d.joinApproval;
    final owner = d.myRole == api.GroupRole.owner;
    final colors = Theme.of(context).extension<AppColorTokens>()!;

    Widget action({
      required Key key,
      required IconData icon,
      required String label,
      required VoidCallback onTap,
      bool destructive = false,
    }) {
      final ink = destructive ? colors.dangerText : colors.text;
      return Expanded(
        child: Semantics(
          button: true,
          label: label,
          excludeSemantics: true,
          child: AppPressable(
            onTap: onTap,
            child: Container(
              key: key,
              height: 56,
              padding: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(AppRadii.field),
                color: colors.surface,
                border: Border.all(color: colors.border),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  AppIcon(icon, color: ink, size: 22),
                  const SizedBox(height: 2),
                  Text(
                    label,
                    maxLines: 1,
                    textAlign: TextAlign.center,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context)
                        .extension<AppTypographyTokens>()!
                        .caption
                        .copyWith(color: ink),
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    }

    final link = d.inviteEnabled && d.type != api.GroupType.private
        ? d.inviteLink
        : null;
    final actions = [
      action(
        key: const ValueKey('group-action-mute'),
        icon: muted
            ? AppIcons.notificationsOffOutlined
            : AppIcons.notificationsActiveOutlined,
        label: t.t(muted ? 'group.info.mute.unmute' : 'group.info.mute.mute'),
        onTap: () => _openMute(d),
      ),
      if (d.canAdd)
        action(
          key: const ValueKey('group-action-add'),
          icon: AppIcons.personAddAlt1Rounded,
          label: t.t('group.inv.add'),
          onTap: () => _addMembers(d),
        ),
      if (d.canCall && ref.watch(groupCallPortProvider) != null) ...[
        action(
          key: const ValueKey('group-action-audio'),
          icon: AppIcons.callOutlined,
          label: t.t('contact.audio'),
          onTap: () => _startCall(d, t, video: false),
        ),
        if (ref.watch(groupVideoCallsProvider))
          action(
            key: const ValueKey('group-action-video'),
            icon: AppIcons.videoCameraOutlined,
            label: t.t('chat.attach.video'),
            onTap: () => _startCall(d, t, video: true),
          ),
      ],
      if (link != null)
        action(
          key: const ValueKey('group-action-link'),
          icon: AppIcons.linkRounded,
          label: t.t('referral.copy'),
          onTap: () async {
            await Clipboard.setData(ClipboardData(text: link));
            _toast(t.t('group.info.link.copied'));
          },
        ),
      action(
        key: const ValueKey('group-action-leave'),
        icon: AppIcons.logoutRounded,
        label: t.t('group.info.leave.confirm'),
        destructive: true,
        onTap: () {
          if (!_leaving) unawaited(_leave(d, t));
        },
      ),
    ];

    return CustomScrollView(
      key: const ValueKey('group-info'),
      slivers: [
        SliverToBoxAdapter(
          child: GroupInfoHeader(
            detail: d,
            photoBusy: _photoBusy,
            onOpenPhoto: () => showPhotoGallery(
              context,
              urls: [d.avatarFullUrl ?? d.avatarUrl ?? ''],
              closeLabel: t.t('common.close'),
            ),
            onEditPhoto: d.canEditInfo ? () => _editPhoto(d) : null,
            onEditTitle: d.canEditInfo ? () => _editTitle(d) : null,
            onEditDescription: d.canEditInfo ? () => _editDescription(d) : null,
          ),
        ),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(
              AppSpacing.screenSide,
              AppSpacing.md,
              AppSpacing.screenSide,
              AppSpacing.md,
            ),
            // Up to four buttons in one row, more are split in two rows.
            child: Column(
              children: [
                for (final rowItems in _rows(actions)) ...[
                  if (rowItems != _rows(actions).first)
                    const SizedBox(height: AppSpacing.sm),
                  Row(
                    children: [
                      for (var i = 0; i < rowItems.length; i++) ...[
                        if (i > 0) const SizedBox(width: AppSpacing.sm),
                        rowItems[i],
                      ],
                    ],
                  ),
                ],
              ],
            ),
          ),
        ),
        SliverToBoxAdapter(
          child: GroupInfoSection(
            children: [
              GroupInfoNavRow(
                key: const ValueKey('group-shared-media'),
                neutral: true,
                icon: AppIcons.photoLibraryOutlined,
                label: t.t('contact.mediaLinksDocs'),
                onTap: () => Navigator.of(context).push(
                  MaterialPageRoute<void>(
                    builder: (_) => GroupFilesScreen(groupId: _id),
                  ),
                ),
              ),
            ],
          ),
        ),
        if (ref.watch(groupCallPortProvider) != null)
          SliverToBoxAdapter(
            child: GroupInfoSection(
              children: [
                GroupInfoSwitchRow(
                  key: const ValueKey('group-calls-muted'),
                  icon: AppIcons.notificationsOffOutlined,
                  label: t.t('mute.calls'),
                  subtitle: t.t('mute.callsNote'),
                  value: _callsMuted ?? d.callsMuted,
                  onChanged: (v) => _setCallsMuted(d, muted: v),
                ),
              ],
            ),
          ),
        if (d.hasRight('invite') && closedWithApproval)
          SliverToBoxAdapter(
            child: GroupInfoSection(
              children: [
                GroupInfoNavRow(
                  key: const ValueKey('group-requests'),
                  icon: AppIcons.verifiedUserOutlined,
                  label: t.t('group.info.requests.title'),
                  badge: d.pendingRequests,
                  onTap: () async {
                    await showGroupRequestsSheet(context, groupId: _id);
                    if (mounted) _refresh();
                  },
                ),
              ],
            ),
          ),
        // Owner 2026-10-21 (WhatsApp): disappearing messages; the people who
        // may edit the group info change it, the others just see it.
        SliverToBoxAdapter(
          child: GroupInfoSection(
            children: [
              AppListRow(
                dense: true,
                key: const ValueKey('group-disappearing'),
                icon: AppIcons.timerOutlined,
                label: t.t('dm.title'),
                trailingText: disappearValue(t, d.disappearAfterS?.toInt()),
                showChevron: false,
                onTap: d.canEditInfo
                    ? () async {
                        final picked = await pickDisappearing(
                          context,
                          t,
                          current: d.disappearAfterS?.toInt(),
                        );
                        if (picked == null || !mounted) return;
                        final error = await _update(
                          api.UpdateGroupDto(
                            disappearAfterS:
                                api.UpdateGroupDtoDisappearAfterS.fromJson(
                              picked,
                            ),
                          ),
                        );
                        if (error != null) _toast(error);
                      }
                    : null,
              ),
            ],
          ),
        ),
        if (groupShowsLink(d))
          SliverToBoxAdapter(
            child: GroupInfoLink(
              detail: d,
              onReset: d.hasRight('invite')
                  ? () => _change(
                        () =>
                            ref.read(groupRepositoryProvider).resetInvite(_id),
                      )
                  : null,
            ),
          ),
        if (d.hasRight('info'))
          SliverToBoxAdapter(
            child: GroupInfoSettings(
              detail: d,
              update: _update,
              onError: _toast,
            ),
          ),
        if (d.members.any((m) => m.role == api.GroupRole.admin))
          SliverToBoxAdapter(
            child: GroupInfoSection(
              children: [
                GroupInfoNavRow(
                  key: const ValueKey('group-admins'),
                  neutral: true,
                  icon: AppIcons.adminPanelSettingsOutlined,
                  label: t.t('channel.admins'),
                  badge: d.members
                      .where((m) => m.role == api.GroupRole.admin)
                      .length,
                  onTap: () => _openAdmins(d, t),
                ),
              ],
            ),
          ),
        if (d.hasRight('info') && d.topicsEnabled)
          SliverToBoxAdapter(child: GroupInfoTopics(groupId: _id)),
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsetsDirectional.fromSTEB(
              AppSpacing.screenSide + AppSpacing.xs,
              AppSpacing.sm,
              AppSpacing.screenSide,
              AppSpacing.sm,
            ),
            child: Text(
              t.plural('group.info.members', d.members.length),
              key: const ValueKey('group-members-title'),
              style: Theme.of(context)
                  .extension<AppTypographyTokens>()!
                  .bodySmall
                  .copyWith(
                    color: colors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
            ),
          ),
        ),
        SliverPadding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.screenSide,
          ),
          sliver: DecoratedSliver(
            decoration: BoxDecoration(
              color: colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.card),
              border: Border.all(color: colors.border),
            ),
            sliver: SliverList.builder(
              itemCount: d.members.length,
              itemBuilder: (context, i) {
                final m = d.members[i];
                final manage = _canManage(d, m, me);
                return GroupInfoMemberTile(
                  key: ValueKey('member-${m.userId}'),
                  member: m,
                  isMe: m.userId == me,
                  onOpen: m.username == null ? null : () => _openProfile(m),
                  onMenu: manage ? () => _memberMenu(d, m, t) : null,
                );
              },
            ),
          ),
        ),
        if (d.invited.isNotEmpty) ...[
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.xl,
                AppSpacing.screenSide,
                AppSpacing.sm,
              ),
              child: Text(
                t.t('group.inv.sent', {
                  'count': context.digits(d.invited.length),
                }),
                key: const ValueKey('group-invited-title'),
                style: Theme.of(context)
                    .extension<AppTypographyTokens>()!
                    .bodySmall
                    .copyWith(
                      color: colors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
              ),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenSide,
            ),
            sliver: DecoratedSliver(
              decoration: BoxDecoration(
                color: colors.surface,
                borderRadius: BorderRadius.circular(AppRadii.card),
                border: Border.all(color: colors.border),
              ),
              sliver: SliverList.builder(
                itemCount: d.invited.length,
                itemBuilder: (context, i) => GroupInvitedTile(
                  key: ValueKey('invited-${d.invited[i].userId}'),
                  person: d.invited[i],
                ),
              ),
            ),
          ),
        ],
        SliverToBoxAdapter(
          child: Padding(
            padding: const EdgeInsets.only(top: AppSpacing.xl),
            child: GroupInfoSection(
              children: [
                if (owner)
                  AppListRow(
                    key: const ValueKey('group-delete'),
                    icon: AppIcons.deleteForeverRounded,
                    label: t.t('group.info.delete.title'),
                    destructive: true,
                    showChevron: false,
                    onTap: _leaving ? null : () => _delete(t),
                  ),
              ],
            ),
          ),
        ),
        const SliverToBoxAdapter(child: SizedBox(height: AppSpacing.xxl)),
      ],
    );
  }
}
