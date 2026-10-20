import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/channels/presentation/channel_actions.dart';
import 'package:lawbid/features/channels/presentation/channel_widgets.dart';

/// Owner 2026-10-20: the owner's team screen — who administers the channel,
/// add by @username, remove.
class ChannelAdminsScreen extends ConsumerStatefulWidget {
  const ChannelAdminsScreen({required this.channelId, super.key});

  final String channelId;

  @override
  ConsumerState<ChannelAdminsScreen> createState() =>
      _ChannelAdminsScreenState();
}

class _ChannelAdminsScreenState extends ConsumerState<ChannelAdminsScreen> {
  final _text = TextEditingController();
  bool _adding = false;
  String? _error;

  @override
  void dispose() {
    _text.dispose();
    super.dispose();
  }

  Future<void> _add() async {
    final t = ref.read(translatorProvider);
    final name = normalizeChannelUsername(_text.text);
    if (name.isEmpty || _adding) return;
    setState(() {
      _adding = true;
      _error = null;
    });
    try {
      await ref
          .read(channelAdminsProvider(widget.channelId).notifier)
          .add(name);
      _text.clear();
      if (mounted) showAppSnackBar(context, t.t('channel.admins.added'));
    } on Object catch (e) {
      if (mounted) setState(() => _error = channelErrorText(t, e));
    } finally {
      if (mounted) setState(() => _adding = false);
    }
  }

  Future<void> _remove(ChannelAdmin admin) async {
    final t = ref.read(translatorProvider);
    final ok = await confirmChannelAction(
      context,
      ref,
      title: t.t('channel.admins.remove.title'),
      message: t.t('channel.admins.remove.message', {'name': admin.user.name}),
      confirmLabel: t.t('common.remove'),
    );
    if (!ok || !mounted) return;
    try {
      await ref
          .read(channelAdminsProvider(widget.channelId).notifier)
          .remove(admin);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, channelErrorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final admins = ref.watch(channelAdminsProvider(widget.channelId));
    return ChannelsGate(
      child: Scaffold(
        backgroundColor: colors.bg,
        appBar: AppTopBar(
          leading: AppBackButton(
            semanticLabel: t.t('common.back'),
            onPressed: () => Navigator.of(context).maybePop(),
          ),
          title: Text(t.t('channel.admins')),
        ),
        body: ListView(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          children: [
            Text(
              t.t('channel.admins.hint'),
              style: type.bodySmall.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              key: const ValueKey('channel-admin-field'),
              controller: _text,
              label: t.t('channel.admins.add'),
              hintText: t.t('channel.form.usernameHint'),
              errorText: _error,
              leading: Text(
                '@',
                style: type.body.copyWith(color: colors.textSecondary),
              ),
              enabled: !_adding,
              textInputAction: TextInputAction.done,
              onChanged: (_) => setState(() => _error = null),
              onSubmitted: (_) => _add(),
            ),
            const SizedBox(height: AppSpacing.sm),
            ValueListenableBuilder<TextEditingValue>(
              valueListenable: _text,
              builder: (context, v, _) => AppButton(
                key: const ValueKey('channel-admin-add'),
                label: t.t('channel.admins.addButton'),
                height: AppSizes.touchTarget,
                isEnabled: v.text.trim().isNotEmpty && !_adding,
                isLoading: _adding,
                onPressed: _add,
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            switch (admins) {
              AsyncData(:final value) => Column(
                  children: [
                    for (final a in value)
                      _AdminRow(
                        key: ValueKey('channel-admin-${a.user.id}'),
                        admin: a,
                        roleLabel: a.role == ChannelRole.owner
                            ? t.t('channel.role.owner')
                            : t.t('channel.role.admin'),
                        removeLabel: t.t('channel.admins.remove'),
                        onRemove: a.role == ChannelRole.owner
                            ? null
                            : () => _remove(a),
                      ),
                  ],
                ),
              AsyncError(:final error) => CasesErrorView(
                  error: error,
                  t: t,
                  onRetry: () =>
                      ref.invalidate(channelAdminsProvider(widget.channelId)),
                ),
              _ => const Padding(
                  padding: EdgeInsets.all(AppSpacing.xl),
                  child: Center(child: CircularProgressIndicator()),
                ),
            },
          ],
        ),
      ),
    );
  }
}

class _AdminRow extends StatelessWidget {
  const _AdminRow({
    required this.admin,
    required this.roleLabel,
    required this.removeLabel,
    required this.onRemove,
    super.key,
  });

  final ChannelAdmin admin;
  final String roleLabel;
  final String removeLabel;
  final VoidCallback? onRemove;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final u = admin.user;
    return ConstrainedBox(
      constraints: const BoxConstraints(minHeight: AppSizes.touchTarget),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: Row(
          children: [
            AppAvatar(
              size: 44,
              initials: u.initials.isEmpty ? null : u.initials,
              imageProvider: u.avatarUrl == null
                  ? null
                  : appNetworkImage(u.avatarUrl!, decodeWidthFor(44)),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    u.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.body.copyWith(
                      color: colors.text,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  Text(
                    '@${u.username} · $roleLabel',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                ],
              ),
            ),
            if (onRemove != null)
              AppIconButton(
                key: ValueKey('channel-admin-remove-${u.id}'),
                icon: AppIcon(
                  AppIcons.removeCircleOutlineRounded,
                  color: colors.dangerText,
                ),
                semanticLabel: removeLabel,
                onPressed: onRemove,
              ),
          ],
        ),
      ),
    );
  }
}
