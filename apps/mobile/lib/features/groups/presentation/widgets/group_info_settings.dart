import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/text/bidi.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_section.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_info_sheets.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Sends a settings change and returns an error text to show, or null when
/// it worked (the screen then refreshes from the answer).
typedef GroupUpdater = Future<String?> Function(api.UpdateGroupDto change);

/// Server rule for a public @username (GROUP_USERNAME_RE).
final RegExp groupUsernameRe = RegExp(r'^[A-Za-z][A-Za-z0-9_]{4,31}$');

/// The admin block: who may write / add / edit / call, the group type, the
/// join link switch, join approval and the topics (forum) switch.
class GroupInfoSettings extends ConsumerWidget {
  const GroupInfoSettings({
    required this.detail,
    required this.update,
    required this.onError,
    super.key,
  });

  final api.GroupDetailDto detail;
  final GroupUpdater update;

  /// Shows a failed change (snackbar).
  final void Function(String message) onError;

  Future<void> _run(api.UpdateGroupDto change) async {
    final error = await update(change);
    if (error != null) onError(error);
  }

  String _who(Translator t, api.GroupWho who) => t.t(
        who == api.GroupWho.all
            ? 'group.info.who.all'
            : 'group.info.who.admins',
      );

  Future<void> _pickWho(
    BuildContext context,
    Translator t, {
    required String title,
    required api.GroupWho current,
    required api.UpdateGroupDto Function(api.GroupWho who) build,
  }) async {
    final picked = await showGroupChoiceSheet<api.GroupWho>(
      context,
      title: title,
      current: current,
      choices: [
        GroupChoice(
          value: api.GroupWho.all,
          label: t.t('group.info.who.all'),
          icon: AppIcons.groups2Outlined,
        ),
        GroupChoice(
          value: api.GroupWho.admins,
          label: t.t('group.info.who.admins'),
          icon: AppIcons.adminPanelSettingsOutlined,
        ),
      ],
    );
    if (picked == null || picked == current) return;
    await _run(build(picked));
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final typeLabel = switch (detail.type) {
      api.GroupType.public => t.t('group.info.type.public'),
      api.GroupType.closed => t.t('group.info.type.closed'),
      _ => t.t('group.info.type.private'),
    };
    final hasLink = detail.type != api.GroupType.private;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        GroupInfoSection(
          title: t.t('group.info.settings.permissions'),
          children: [
            AppListRow(
              dense: true,
              key: const ValueKey('group-set-post'),
              icon: AppIcons.chatBubbleOutlineRounded,
              label: t.t('group.info.settings.whoPost'),
              subtitle: _who(t, detail.whoCanPost),
              onTap: () => _pickWho(
                context,
                t,
                title: t.t('group.info.settings.whoPost'),
                current: detail.whoCanPost,
                build: (w) => api.UpdateGroupDto(
                  whoCanPost: api.UpdateGroupDtoWhoCanPost.fromJson(w.name),
                ),
              ),
            ),
            AppListRow(
              dense: true,
              key: const ValueKey('group-set-add'),
              icon: AppIcons.personAddAlt1Rounded,
              label: t.t('group.info.settings.whoAdd'),
              subtitle: _who(t, detail.whoCanAdd),
              onTap: () => _pickWho(
                context,
                t,
                title: t.t('group.info.settings.whoAdd'),
                current: detail.whoCanAdd,
                build: (w) => api.UpdateGroupDto(
                  whoCanAdd: api.UpdateGroupDtoWhoCanAdd.fromJson(w.name),
                ),
              ),
            ),
            AppListRow(
              dense: true,
              key: const ValueKey('group-set-edit'),
              icon: AppIcons.editOutlined,
              label: t.t('group.info.settings.whoEdit'),
              subtitle: _who(t, detail.whoCanEditInfo),
              onTap: () => _pickWho(
                context,
                t,
                title: t.t('group.info.settings.whoEdit'),
                current: detail.whoCanEditInfo,
                build: (w) => api.UpdateGroupDto(
                  whoCanEditInfo:
                      api.UpdateGroupDtoWhoCanEditInfo.fromJson(w.name),
                ),
              ),
            ),
            AppListRow(
              dense: true,
              key: const ValueKey('group-set-call'),
              icon: AppIcons.callOutlined,
              label: t.t('group.info.settings.whoCall'),
              subtitle: _who(t, detail.whoCanCall),
              onTap: () => _pickWho(
                context,
                t,
                title: t.t('group.info.settings.whoCall'),
                current: detail.whoCanCall,
                build: (w) => api.UpdateGroupDto(
                  whoCanCall: api.UpdateGroupDtoWhoCanCall.fromJson(w.name),
                ),
              ),
            ),
          ],
        ),
        GroupInfoSection(
          title: t.t('group.info.settings.access'),
          children: [
            AppListRow(
              dense: true,
              key: const ValueKey('group-set-type'),
              icon: switch (detail.type) {
                api.GroupType.public => AppIcons.publicRounded,
                api.GroupType.closed => AppIcons.linkRounded,
                _ => AppIcons.lockOutlineRounded,
              },
              label: t.t('group.info.settings.type'),
              subtitle: typeLabel,
              onTap: () => showGroupTypeSheet(
                context,
                detail: detail,
                update: update,
              ),
            ),
            if (detail.type == api.GroupType.closed)
              GroupInfoSwitchRow(
                key: const ValueKey('group-set-approval'),
                icon: AppIcons.verifiedUserOutlined,
                label: t.t('group.info.settings.approval'),
                subtitle: t.t('group.info.settings.approvalNote'),
                value: detail.joinApproval,
                onChanged: (v) => _run(api.UpdateGroupDto(joinApproval: v)),
              ),
            if (hasLink)
              GroupInfoSwitchRow(
                key: const ValueKey('group-set-invite'),
                icon: AppIcons.linkRounded,
                label: t.t('group.info.settings.inviteLink'),
                subtitle: t.t('group.info.settings.inviteLinkNote'),
                value: detail.inviteEnabled,
                onChanged: (v) => _run(api.UpdateGroupDto(inviteEnabled: v)),
              ),
          ],
        ),
        GroupInfoSection(
          children: [
            GroupInfoSwitchRow(
              key: const ValueKey('group-set-topics'),
              icon: AppIcons.forumOutlined,
              label: t.t('group.info.settings.topics'),
              value: detail.topicsEnabled,
              onChanged: (v) async {
                if (!v) {
                  final ok = await confirmGroupAction(
                    context,
                    title: t.t('group.info.settings.topicsOffTitle'),
                    message: t.t('group.info.settings.topicsOffBody'),
                    confirmLabel: t.t('group.info.settings.topicsOffConfirm'),
                    cancelLabel: t.t('common.cancel'),
                  );
                  if (!ok) return;
                }
                await _run(api.UpdateGroupDto(topicsEnabled: v));
              },
            ),
          ],
        ),
        GroupInfoNote(t.t('group.info.settings.topicsNote')),
      ],
    );
  }
}

/// The «Group type» sheet: Public (needs a @username), Closed (with the
/// «admins approve new members» switch) or Private.
Future<void> showGroupTypeSheet(
  BuildContext context, {
  required api.GroupDetailDto detail,
  required GroupUpdater update,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => _TypeSheet(detail: detail, update: update),
    );

class _TypeSheet extends ConsumerStatefulWidget {
  const _TypeSheet({required this.detail, required this.update});

  final api.GroupDetailDto detail;
  final GroupUpdater update;

  @override
  ConsumerState<_TypeSheet> createState() => _TypeSheetState();
}

class _TypeSheetState extends ConsumerState<_TypeSheet> {
  late api.GroupType _type = widget.detail.type;
  late bool _approval = widget.detail.joinApproval;
  late final TextEditingController _username =
      TextEditingController(text: widget.detail.username ?? '');
  String? _error;
  bool _busy = false;

  @override
  void dispose() {
    _username.dispose();
    super.dispose();
  }

  bool get _changed =>
      _type != widget.detail.type ||
      (_type == api.GroupType.closed &&
          _approval != widget.detail.joinApproval) ||
      (_type == api.GroupType.public &&
          _username.text.trim() != (widget.detail.username ?? ''));

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    final name = _username.text.trim();
    if (_type == api.GroupType.public && !groupUsernameRe.hasMatch(name)) {
      setState(() => _error = t.t('group.info.usernameInvalid'));
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    final error = await widget.update(
      api.UpdateGroupDto(
        type: _type,
        username: _type == api.GroupType.public ? name : null,
        joinApproval: _type == api.GroupType.closed ? _approval : null,
      ),
    );
    if (!mounted) return;
    if (error == null) {
      Navigator.of(context).pop();
    } else {
      setState(() {
        _busy = false;
        _error = error;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;

    Widget option(api.GroupType value, IconData icon, String key) => Padding(
          padding: const EdgeInsets.only(bottom: AppSpacing.xs),
          child: AppListRow(
            icon: icon,
            label: t.t('group.info.type.$key'),
            subtitle: t.t('group.info.type.${key}Note'),
            selected: _type == value,
            showChevron: false,
            onTap: _busy
                ? null
                : () => setState(() {
                      _type = value;
                      _error = null;
                    }),
          ),
        );

    return AnimatedPadding(
      duration: Duration.zero,
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        top: false,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: AppSheetHandle()),
              Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.md,
                  vertical: AppSpacing.sm,
                ),
                child: Text(
                  t.t('group.info.settings.type'),
                  style: type.titleMedium.copyWith(color: colors.text),
                ),
              ),
              option(api.GroupType.public, AppIcons.publicRounded, 'public'),
              option(api.GroupType.closed, AppIcons.linkRounded, 'closed'),
              option(
                api.GroupType.private,
                AppIcons.lockOutlineRounded,
                'private',
              ),
              if (_type == api.GroupType.public) ...[
                const SizedBox(height: AppSpacing.sm),
                AppTextField(
                  controller: _username,
                  enabled: !_busy,
                  label: t.t('group.info.username'),
                  hintText: t.t('group.info.usernameHint'),
                  helperText: t.t('group.info.usernameRule'),
                  errorText: _error,
                  maxLength: 32,
                  leading: Text(
                    ltrIsolate('@'),
                    style: type.body.copyWith(color: colors.textSecondary),
                  ),
                  inputFormatters: [
                    FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9_]')),
                  ],
                  onChanged: (_) => setState(() => _error = null),
                ),
              ],
              if (_type == api.GroupType.closed) ...[
                const SizedBox(height: AppSpacing.xs),
                GroupInfoSwitchRow(
                  icon: AppIcons.verifiedUserOutlined,
                  label: t.t('group.info.settings.approval'),
                  subtitle: t.t('group.info.settings.approvalNote'),
                  value: _approval,
                  onChanged:
                      _busy ? null : (v) => setState(() => _approval = v),
                ),
              ],
              if (_error != null && _type != api.GroupType.public)
                Padding(
                  padding: const EdgeInsets.only(top: AppSpacing.sm),
                  child: Text(
                    _error!,
                    style: type.bodySmall.copyWith(color: colors.dangerText),
                  ),
                ),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: t.t('common.save'),
                height: AppSizes.touchTarget,
                isLoading: _busy,
                isEnabled: _changed,
                onPressed: _busy || !_changed ? null : _save,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
