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
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/groups/application/group_avatar_upload.dart';
import 'package:lawbid/features/groups/application/group_create_rules.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid/features/groups/presentation/widgets/people_picker.dart';
import 'package:lawbid/features/profile/presentation/widgets/avatar_picker_field.dart'
    show AvatarSource, avatarImagePickerProvider;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// «New group»: step 1 picks the people, step 2 sets the photo, name, type
/// (public / closed / private) and creates the group.
class CreateGroupScreen extends ConsumerStatefulWidget {
  const CreateGroupScreen({super.key});

  @override
  ConsumerState<CreateGroupScreen> createState() => _CreateGroupScreenState();
}

class _CreateGroupScreenState extends ConsumerState<CreateGroupScreen> {
  final _title = TextEditingController();
  final _description = TextEditingController();
  final _username = TextEditingController();
  final _people = <PickedPerson>[];

  var _step = 0;
  var _type = api.GroupType.private;
  var _approval = false;
  var _creating = false;

  /// The username the server said is taken (cleared once it is edited).
  String? _takenUsername;

  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    _username.dispose();
    super.dispose();
  }

  void _toggle(PickedPerson p) => setState(() {
        final i = _people.indexWhere((x) => x.userId == p.userId);
        if (i >= 0) {
          _people.removeAt(i);
        } else {
          _people.add(p);
        }
      });

  String get _usernameText {
    final v = _username.text.trim();
    return v.startsWith('@') ? v.substring(1) : v;
  }

  bool get _usernameOk =>
      _type != api.GroupType.public ||
      groupUsernameIssue(_usernameText) == null;

  bool get _needsPeople => _type == api.GroupType.private && _people.isEmpty;

  Future<void> _pickPhoto(Translator t) async {
    final source = await showAppBottomSheet<AvatarSource>(
      context: context,
      builder: (sheet) => SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const AppSheetHandle(),
              AppListRow(
                icon: AppIcons.photoCameraOutlined,
                label: t.t('profile.photo.camera'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(AvatarSource.camera),
              ),
              const SizedBox(height: AppSpacing.xs),
              AppListRow(
                icon: AppIcons.photoLibraryOutlined,
                label: t.t('profile.photo.gallery'),
                showChevron: false,
                onTap: () => Navigator.of(sheet).pop(AvatarSource.gallery),
              ),
            ],
          ),
        ),
      ),
    );
    if (source == null || !mounted) return;
    try {
      final bytes = await ref.read(avatarImagePickerProvider)(source);
      if (bytes == null || !mounted) return;
      unawaited(ref.read(groupAvatarUploadProvider.notifier).start(bytes));
    } on Object {
      if (mounted) showAppSnackBar(context, t.t('profile.photo.pickFailed'));
    }
  }

  Future<void> _create(Translator t) async {
    final avatar = ref.read(groupAvatarUploadProvider);
    final title = _title.text.trim();
    if (_creating || title.isEmpty || avatar.busy || !_usernameOk) return;
    final description = _description.text.trim();
    final isPublic = _type == api.GroupType.public;
    setState(() => _creating = true);
    try {
      final group = await ref.read(groupRepositoryProvider).create(
            api.CreateGroupDto(
              title: title,
              memberIds: [for (final p in _people) p.userId],
              type: _type,
              description: description.isEmpty ? null : description,
              avatarFileId: avatar.fileId,
              username: isPublic ? _usernameText : null,
              joinApproval: _type == api.GroupType.closed ? _approval : null,
            ),
          );
      ref.invalidate(groupsProvider);
      if (!mounted) return;
      context.pushReplacement(GroupRoutes.group(group.id));
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _creating = false;
        if (e.code == ApiErrorCodes.groupUsernameTaken) {
          _takenUsername = _usernameText;
        }
      });
      if (e.code != ApiErrorCodes.groupUsernameTaken) {
        showAppSnackBar(context, apiErrorText(t, e));
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _creating = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  void _back() {
    if (_step == 1 && !_creating) {
      setState(() => _step = 0);
    } else {
      unawaited(Navigator.of(context).maybePop());
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop && !_creating) setState(() => _step = 0);
      },
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: _back,
          ),
          title: Text(
            t.t(
              _step == 0 ? 'group.create.membersTitle' : 'group.create.title',
            ),
          ),
        ),
        body: SafeArea(
          child: _step == 0 ? _membersStep(t) : _detailsStep(t),
        ),
      ),
    );
  }

  Widget _membersStep(Translator t) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      children: [
        const SizedBox(height: AppSpacing.sm),
        Expanded(
          child: PeopleSelector(selected: _people, onToggle: _toggle),
        ),
        Padding(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                t.t('group.create.membersHint'),
                textAlign: TextAlign.center,
                style: typography.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: AppSpacing.sm),
              AppButton(
                key: const ValueKey('create-next'),
                label: _people.isEmpty
                    ? t.t('group.create.next')
                    : t.t(
                        'group.create.nextCount',
                        {'count': context.digits(_people.length)},
                      ),
                onPressed: () => setState(() => _step = 1),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _detailsStep(Translator t) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final avatar = ref.watch(groupAvatarUploadProvider);
    final canCreate = _title.text.trim().isNotEmpty &&
        !avatar.busy &&
        !_creating &&
        _usernameOk &&
        !_needsPeople;
    final hint = _needsPeople
        ? t.t('group.create.needPeople')
        : _title.text.trim().isEmpty
            ? t.t('group.create.needName')
            : null;
    return Column(
      children: [
        Expanded(
          child: ListView(
            keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
            padding: const EdgeInsets.all(AppSpacing.screenSide),
            children: [
              _PhotoField(
                state: avatar,
                title: _title.text,
                onPick: () => _pickPhoto(t),
                onRetry: () =>
                    ref.read(groupAvatarUploadProvider.notifier).retry(),
                onClear: () =>
                    ref.read(groupAvatarUploadProvider.notifier).clear(),
                t: t,
              ),
              const SizedBox(height: AppSpacing.xl),
              AppTextField(
                key: const ValueKey('group-title'),
                controller: _title,
                label: t.t('group.create.name'),
                semanticLabel: t.t('group.create.name'),
                maxLength: groupTitleMax,
                textCapitalization: TextCapitalization.sentences,
                textInputAction: TextInputAction.next,
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(
                key: const ValueKey('group-description'),
                controller: _description,
                label: t.t('group.create.description'),
                semanticLabel: t.t('group.create.description'),
                maxLength: groupDescriptionMax,
                maxLines: 3,
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: AppSpacing.xl),
              Text(
                t.t('group.create.type'),
                style: typography.bodySmall.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
              const SizedBox(height: AppSpacing.sm),
              for (final type in const [
                api.GroupType.private,
                api.GroupType.closed,
                api.GroupType.public,
              ]) ...[
                _TypeCard(
                  key: ValueKey('group-type-${type.json}'),
                  icon: switch (type) {
                    api.GroupType.public => AppIcons.publicRounded,
                    api.GroupType.closed => AppIcons.linkRounded,
                    _ => AppIcons.lockOutlineRounded,
                  },
                  title: t.t('group.create.type.${type.json}'),
                  description: t.t('group.create.type.${type.json}.desc'),
                  selected: _type == type,
                  onTap: () => setState(() => _type = type),
                ),
                const SizedBox(height: AppSpacing.sm),
              ],
              if (_type == api.GroupType.closed)
                SwitchListTile.adaptive(
                  key: const ValueKey('group-approval'),
                  contentPadding: EdgeInsets.zero,
                  title: Text(
                    t.t('group.create.approval'),
                    style: typography.body.copyWith(color: colors.text),
                  ),
                  value: _approval,
                  activeThumbColor: colors.gold,
                  onChanged: (v) => setState(() => _approval = v),
                ),
              if (_type == api.GroupType.public) _usernameField(t),
              if (_people.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                _MembersSummary(
                  people: _people,
                  title: t.t('group.create.membersCount', {
                    'count': context.digits(_people.length),
                  }),
                  onEdit: () => setState(() => _step = 0),
                  editLabel: t.t('group.create.editMembers'),
                ),
              ],
            ],
          ),
        ),
        Padding(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.sm,
            AppSpacing.screenSide,
            AppSpacing.screenSide,
          ),
          child: AppButton(
            key: const ValueKey('create-submit'),
            label: t.t('group.create.button'),
            isLoading: _creating,
            isEnabled: canCreate,
            disabledHint: hint,
            onPressed: () => _create(t),
          ),
        ),
      ],
    );
  }

  Widget _usernameField(Translator t) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final text = _usernameText;
    final issue = text.isEmpty ? null : groupUsernameIssue(text);
    String? error;
    if (issue != null) {
      error = t.t('group.username.${issue.name}');
    } else if (_takenUsername != null &&
        _takenUsername!.toLowerCase() == text.toLowerCase()) {
      error = t.t('error.api.GROUP_USERNAME_TAKEN');
    }
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: AppTextField(
        key: const ValueKey('group-username'),
        controller: _username,
        label: t.t('group.create.username'),
        semanticLabel: t.t('group.create.username'),
        helperText: t.t('group.create.usernameHint'),
        errorText: error,
        leading: Text('@', style: TextStyle(color: colors.textSecondary)),
        keyboardType: TextInputType.visiblePassword,
        inputFormatters: [
          FilteringTextInputFormatter.allow(RegExp('[A-Za-z0-9_@]')),
          LengthLimitingTextInputFormatter(groupUsernameMax + 1),
        ],
        onChanged: (_) => setState(() {}),
      ),
    );
  }
}

class _PhotoField extends StatelessWidget {
  const _PhotoField({
    required this.state,
    required this.title,
    required this.onPick,
    required this.onRetry,
    required this.onClear,
    required this.t,
  });

  final GroupAvatarState state;
  final String title;
  final VoidCallback onPick;
  final VoidCallback onRetry;
  final VoidCallback onClear;
  final Translator t;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final failed = state.stage == GroupAvatarStage.failed;
    final status = switch (state.stage) {
      GroupAvatarStage.uploading => t.t(
          'profile.photo.uploading',
          {'percent': context.digits((state.progress * 100).round())},
        ),
      GroupAvatarStage.failed => errorText(t, state.error ?? Object()),
      _ => null,
    };
    final preview = state.preview;
    const size = 88.0;
    return Row(
      children: [
        Semantics(
          button: true,
          label: t.t('group.create.photo'),
          excludeSemantics: true,
          onTap: state.busy ? null : onPick,
          child: AppPressable(
            onTap: state.busy ? null : onPick,
            child: SizedBox.square(
              dimension: size,
              child: Stack(
                fit: StackFit.expand,
                children: [
                  if (preview != null)
                    ClipOval(child: Image.memory(preview, fit: BoxFit.cover))
                  else
                    DecoratedBox(
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: colors.surface,
                        border: Border.all(color: colors.border),
                      ),
                      child: Center(
                        child: title.trim().isEmpty
                            ? AppIcon(
                                AppIcons.addAPhotoOutlined,
                                size: 32,
                                color: colors.goldStroke,
                              )
                            : GroupAvatar(name: title, size: size),
                      ),
                    ),
                  if (state.busy)
                    Center(
                      child: CircularProgressIndicator(
                        value: state.progress > 0 ? state.progress : null,
                        color: colors.gold,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ),
        const SizedBox(width: AppSpacing.lg),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                t.t(
                  preview == null
                      ? 'group.create.photo'
                      : 'group.create.photoChange',
                ),
                style: typography.bodySmall.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
              if (status != null) ...[
                const SizedBox(height: AppSpacing.xs),
                Semantics(
                  liveRegion: true,
                  child: Text(
                    status,
                    style: typography.caption.copyWith(
                      color: failed ? colors.dangerText : colors.textSecondary,
                    ),
                  ),
                ),
              ],
              Wrap(
                spacing: AppSpacing.md,
                children: [
                  if (failed)
                    _LinkAction(label: t.t('error.retry'), onTap: onRetry),
                  if (preview != null && !state.busy)
                    _LinkAction(
                      label: t.t('group.create.photoRemove'),
                      onTap: onClear,
                    ),
                  if (preview == null)
                    _LinkAction(label: t.t('profile.photo.add'), onTap: onPick),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _LinkAction extends StatelessWidget {
  const _LinkAction({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      label: label,
      excludeSemantics: true,
      onTap: onTap,
      child: AppPressable(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
          child: Align(
            widthFactor: 1,
            child: Text(
              label,
              style: typography.button.copyWith(color: colors.goldStroke),
            ),
          ),
        ),
      ),
    );
  }
}

class _TypeCard extends StatelessWidget {
  const _TypeCard({
    required this.icon,
    required this.title,
    required this.description,
    required this.selected,
    required this.onTap,
    super.key,
  });

  final IconData icon;
  final String title;
  final String description;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Semantics(
      button: true,
      selected: selected,
      inMutuallyExclusiveGroup: true,
      label: '$title. $description',
      excludeSemantics: true,
      onTap: onTap,
      child: AppPressable(
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: AppSizes.hitTarget),
          padding: const EdgeInsets.all(AppSpacing.md),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(
              color: selected ? colors.gold : colors.border,
              width: selected ? 1.5 : 1,
            ),
          ),
          child: Row(
            children: [
              AppIcon(
                icon,
                color: selected ? colors.gold : colors.textSecondary,
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: typography.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      description,
                      style: typography.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              AppIcon(
                selected
                    ? AppIcons.radioButtonCheckedRounded
                    : AppIcons.radioButtonUncheckedRounded,
                color: selected ? colors.gold : colors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _MembersSummary extends StatelessWidget {
  const _MembersSummary({
    required this.people,
    required this.title,
    required this.onEdit,
    required this.editLabel,
  });

  final List<PickedPerson> people;
  final String title;
  final VoidCallback onEdit;
  final String editLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                title,
                style: typography.bodySmall.copyWith(
                  color: colors.text,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
            _LinkAction(label: editLabel, onTap: onEdit),
          ],
        ),
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            for (final p in people)
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.sizeOf(context).width * 0.6,
                ),
                child: AppChip(
                  label: p.name,
                  leading:
                      GroupAvatar(name: p.name, url: p.avatarUrl, size: 22),
                ),
              ),
          ],
        ),
      ],
    );
  }
}
