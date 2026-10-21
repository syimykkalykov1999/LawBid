import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart' show ImageSource;
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/files/file_types.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_actions.dart';
import 'package:lawbid/features/channels/presentation/channel_pickers.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';
import 'package:lawbid/shared/presentation/handle_hints.dart';

/// Owner 2026-10-20: create a channel (verified attorneys) or, with
/// [channelRef], edit one (admins; only the owner renames the @username).
class ChannelFormScreen extends ConsumerWidget {
  const ChannelFormScreen({this.channelRef, super.key});

  final String? channelRef;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ref0 = channelRef;
    if (ref0 == null) return const ChannelsGate(child: _Form());
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final channel = ref.watch(channelProvider(ref0));
    return ChannelsGate(
      child: switch (channel) {
        AsyncData(:final value) => _Form(editing: value, channelRef: ref0),
        AsyncError(:final error) => Scaffold(
            backgroundColor: colors.bg,
            appBar: AppTopBar(
              leading: AppBackButton(
                semanticLabel: t.t('common.back'),
                onPressed: () => Navigator.of(context).maybePop(),
              ),
            ),
            body: CasesErrorView(
              error: error,
              t: t,
              onRetry: () => ref.invalidate(channelProvider(ref0)),
            ),
          ),
        _ => Scaffold(
            backgroundColor: colors.bg,
            body: const DetailSkeleton(),
          ),
      },
    );
  }
}

class _Form extends ConsumerStatefulWidget {
  const _Form({this.editing, this.channelRef});

  final Channel? editing;
  final String? channelRef;

  @override
  ConsumerState<_Form> createState() => _FormState();
}

class _FormState extends ConsumerState<_Form> {
  late final _title = TextEditingController(text: widget.editing?.title ?? '');
  late final _username =
      TextEditingController(text: widget.editing?.username ?? '');
  late final _description =
      TextEditingController(text: widget.editing?.description ?? '');
  late bool _comments = widget.editing?.commentsEnabled ?? true;
  late bool _protect = widget.editing?.protectContent ?? false;

  Uint8List? _avatarBytes;
  String? _avatarFileId;
  bool _removeAvatar = false;
  bool _avatarUploading = false;

  bool _saving = false;
  bool _usernameTaken = false;
  bool _touchedUsername = false;

  /// The live check: true free, false refused, null unknown.
  bool? _handleFree;

  Channel? get _editing => widget.editing;
  bool get _canRename => _editing == null || _editing!.isOwner;

  @override
  void dispose() {
    _title.dispose();
    _username.dispose();
    _description.dispose();
    super.dispose();
  }

  bool get _usernameValid => isValidChannelUsername(_username.text);

  bool get _ready =>
      _title.text.trim().isNotEmpty &&
      _usernameValid &&
      (_handleFree ?? true) &&
      !_saving &&
      !_avatarUploading;

  Future<void> _pickAvatar(ImageSource source) async {
    final t = ref.read(translatorProvider);
    final bytes = await ref.read(channelAvatarPickerProvider)(context, source);
    if (bytes == null || !mounted) return;
    setState(() {
      _avatarBytes = bytes;
      _avatarFileId = null;
      _removeAvatar = false;
      _avatarUploading = true;
    });
    try {
      final id = await ref
          .read(channelsRepositoryProvider)
          .uploadAvatar(bytes, sniffImageMime(bytes) ?? 'image/jpeg');
      if (mounted) setState(() => _avatarFileId = id);
    } on Object catch (e) {
      if (mounted) {
        setState(() => _avatarBytes = null);
        showAppSnackBar(context, channelErrorText(t, e));
      }
    } finally {
      if (mounted) setState(() => _avatarUploading = false);
    }
  }

  void _clearAvatar() => setState(() {
        _avatarBytes = null;
        _avatarFileId = null;
        _removeAvatar = true;
      });

  Future<void> _avatarSheet() async {
    final t = ref.read(translatorProvider);
    final hasPicture =
        _avatarBytes != null || (!_removeAvatar && _editing?.avatarUrl != null);
    await showAppBottomSheet<void>(
      context: context,
      builder: (sheet) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            AppListRow(
              key: const ValueKey('channel-avatar-camera'),
              icon: AppIcons.photoCameraOutlined,
              label: t.t('profile.photo.camera'),
              showChevron: false,
              onTap: () {
                Navigator.of(sheet).pop();
                unawaited(_pickAvatar(ImageSource.camera));
              },
            ),
            AppListRow(
              key: const ValueKey('channel-avatar-pick'),
              icon: AppIcons.photoLibraryOutlined,
              label: t.t('profile.photo.gallery'),
              showChevron: false,
              onTap: () {
                Navigator.of(sheet).pop();
                unawaited(_pickAvatar(ImageSource.gallery));
              },
            ),
            if (hasPicture)
              AppListRow(
                key: const ValueKey('channel-avatar-remove'),
                icon: AppIcons.deleteOutlineRounded,
                label: t.t('channel.form.avatarRemove'),
                destructive: true,
                showChevron: false,
                onTap: () {
                  Navigator.of(sheet).pop();
                  _clearAvatar();
                },
              ),
          ],
        ),
      ),
    );
  }

  Future<void> _save() async {
    final t = ref.read(translatorProvider);
    final editing = _editing;
    final draft = ChannelDraft(
      title: _title.text,
      username: _username.text,
      description: _description.text,
      commentsEnabled: _comments,
      avatarFileId: _avatarFileId,
      removeAvatar: _removeAvatar,
      protectContent: editing == null ? null : _protect,
    );
    setState(() {
      _saving = true;
      _usernameTaken = false;
    });
    try {
      final repo = ref.read(channelsRepositoryProvider);
      if (editing == null) {
        final created = await repo.create(draft);
        ref.invalidate(channelListProvider);
        if (mounted) {
          context.pushReplacement(ChannelsRoutes.channel(created.id));
        }
        return;
      }
      final renamed = _canRename &&
          normalizeChannelUsername(_username.text) != editing.username;
      final saved = await repo.update(
        editing.id,
        draft,
        username: renamed ? _username.text : null,
      );
      ref
        ..invalidate(channelProvider)
        ..invalidate(channelListProvider);
      if (!mounted) return;
      if (saved.username != editing.username) {
        context.go(ChannelsRoutes.channel(saved.id));
      } else {
        Navigator.of(context).pop();
      }
    } on Object catch (e) {
      if (!mounted) return;
      if (isChannelUsernameTaken(e)) {
        setState(() => _usernameTaken = true);
      } else {
        showAppSnackBar(context, channelErrorText(t, e));
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _delete() async {
    final t = ref.read(translatorProvider);
    final channel = _editing;
    if (channel == null) return;
    final ok = await confirmChannelAction(
      context,
      ref,
      title: t.t('channel.delete.title'),
      message: t.t('channel.delete.message', {'title': channel.title}),
      confirmLabel: t.t('channel.delete'),
    );
    if (!ok || !mounted) return;
    setState(() => _saving = true);
    try {
      await ref.read(channelsRepositoryProvider).delete(channel.id);
      ref.invalidate(channelListProvider);
      if (mounted) context.go(ChannelsRoutes.list);
    } on Object catch (e) {
      if (mounted) {
        setState(() => _saving = false);
        showAppSnackBar(context, channelErrorText(t, e));
      }
    }
  }

  String? _usernameError(Translator t) {
    if (_usernameTaken) return t.t('channel.form.usernameTaken');
    if (_username.text.trim().isEmpty && !_touchedUsername) return null;
    if (!_usernameValid) return t.t('channel.form.usernameInvalid');
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final editing = _editing;
    final url = _removeAvatar ? null : editing?.avatarUrl;
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: _saving ? () {} : () => Navigator.of(context).maybePop(),
        ),
        title: Text(
          editing == null ? t.t('channel.create') : t.t('channel.edit'),
        ),
      ),
      body: ListenableBuilder(
        listenable: Listenable.merge([_title, _username, _description]),
        builder: (context, _) => Column(
          children: [
            Expanded(
              // Not a lazy ListView: with the keyboard open the description
              // sits outside the built window, and «next» on the @username
              // found nothing to focus, so the typing stayed in it.
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(AppSpacing.screenSide),
                keyboardDismissBehavior:
                    ScrollViewKeyboardDismissBehavior.onDrag,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Semantics(
                        button: true,
                        label: t.t('channel.form.avatar'),
                        child: InkWell(
                          key: const ValueKey('channel-avatar'),
                          onTap: _saving ? null : _avatarSheet,
                          customBorder: const CircleBorder(),
                          child: Stack(
                            alignment: Alignment.center,
                            children: [
                              if (_avatarBytes != null)
                                ClipOval(
                                  child: Image.memory(
                                    _avatarBytes!,
                                    width: 64,
                                    height: 64,
                                    fit: BoxFit.cover,
                                  ),
                                )
                              else
                                ChannelAvatar(
                                  title: _title.text,
                                  url: url,
                                  size: 64,
                                ),
                              if (_avatarUploading)
                                CircularProgressIndicator(
                                  strokeWidth: 3,
                                  color: colors.gold,
                                ),
                            ],
                          ),
                        ),
                      ),
                    ),
                    Center(
                      child: TextButton(
                        onPressed: _saving ? null : _avatarSheet,
                        child: Text(t.t('channel.form.avatarChange')),
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    AppTextField(
                      key: const ValueKey('channel-title'),
                      controller: _title,
                      label: t.t('channel.form.title'),
                      hintText: t.t('channel.form.titleHint'),
                      maxLength: kChannelTitleMax,
                      textCapitalization: TextCapitalization.sentences,
                      textInputAction: TextInputAction.next,
                      enabled: !_saving,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      key: const ValueKey('channel-username'),
                      controller: _username,
                      label: t.t('channel.form.username'),
                      hintText: t.t('channel.form.usernameHint'),
                      helperText: _canRename
                          ? t.t('channel.form.usernameHelp')
                          : t.t('channel.form.usernameLocked'),
                      errorText: _usernameError(t),
                      leading: Text(
                        '@',
                        style: type.body.copyWith(color: colors.textSecondary),
                      ),
                      keyboardType: TextInputType.text,
                      inputFormatters: [
                        FilteringTextInputFormatter.allow(
                          RegExp('[A-Za-z0-9_@]'),
                        ),
                        LengthLimitingTextInputFormatter(33),
                      ],
                      enabled: !_saving && _canRename,
                      textInputAction: TextInputAction.next,
                      onChanged: (_) => setState(() {
                        _touchedUsername = true;
                        _usernameTaken = false;
                      }),
                    ),
                    if (_canRename)
                      HandleHints(
                        text: normalizeChannelUsername(_username.text),
                        kind: 'channel',
                        title: _title.text,
                        id: widget.editing?.id,
                        unchangedText: widget.editing?.username,
                        enabled: _usernameValid,
                        onVerdict: (v) {
                          if (_handleFree != v) setState(() => _handleFree = v);
                        },
                        onPick: (u) => setState(() {
                          _username.text = u;
                          _username.selection =
                              TextSelection.collapsed(offset: u.length);
                          _touchedUsername = true;
                        }),
                      ),
                    const SizedBox(height: AppSpacing.md),
                    AppTextField(
                      key: const ValueKey('channel-description'),
                      controller: _description,
                      label: t.t('channel.form.description'),
                      hintText: t.t('channel.form.descriptionHint'),
                      maxLines: 4,
                      maxLength: kChannelDescriptionMax,
                      textCapitalization: TextCapitalization.sentences,
                      enabled: !_saving,
                      minHeight: 96,
                    ),
                    const SizedBox(height: AppSpacing.md),
                    MergeSemantics(
                      child: Row(
                        children: [
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  t.t('channel.form.comments'),
                                  style: type.body.copyWith(color: colors.text),
                                ),
                                Text(
                                  t.t('channel.form.commentsHint'),
                                  style: type.caption
                                      .copyWith(color: colors.textSecondary),
                                ),
                              ],
                            ),
                          ),
                          Switch(
                            key: const ValueKey('channel-comments-switch'),
                            value: _comments,
                            activeThumbColor: colors.onAccent,
                            activeTrackColor: colors.gold,
                            onChanged: _saving
                                ? null
                                : (v) => setState(() => _comments = v),
                          ),
                        ],
                      ),
                    ),
                    // Owner 2026-10-21 (Telegram «Запретить копирование и
                    // пересылку»): a setting of an existing channel.
                    if (editing != null) ...[
                      const SizedBox(height: AppSpacing.md),
                      MergeSemantics(
                        child: Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    t.t('channel.form.protect'),
                                    style:
                                        type.body.copyWith(color: colors.text),
                                  ),
                                  Text(
                                    t.t('channel.form.protectNote'),
                                    style: type.caption
                                        .copyWith(color: colors.textSecondary),
                                  ),
                                ],
                              ),
                            ),
                            Switch(
                              key: const ValueKey('channel-protect-switch'),
                              value: _protect,
                              activeThumbColor: colors.onAccent,
                              activeTrackColor: colors.gold,
                              onChanged: _saving
                                  ? null
                                  : (v) => setState(() => _protect = v),
                            ),
                          ],
                        ),
                      ),
                    ],
                    if (editing != null && editing.isOwner) ...[
                      const SizedBox(height: AppSpacing.lg),
                      AppButton(
                        key: const ValueKey('channel-form-delete'),
                        label: t.t('channel.delete'),
                        variant: AppButtonVariant.secondary,
                        height: AppSizes.touchTarget,
                        icon: AppIcons.deleteOutlineRounded,
                        isEnabled: !_saving,
                        onPressed: _delete,
                      ),
                    ],
                  ],
                ),
              ),
            ),
            SafeArea(
              top: false,
              child: Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.md,
                ),
                child: AppButton(
                  key: const ValueKey('channel-form-save'),
                  label: editing == null
                      ? t.t('channel.form.createButton')
                      : t.t('common.save'),
                  height: AppSizes.touchTarget,
                  isEnabled: _ready,
                  isLoading: _saving,
                  disabledHint: t.t('channel.form.incomplete'),
                  onPressed: _save,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
