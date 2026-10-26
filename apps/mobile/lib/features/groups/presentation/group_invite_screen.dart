import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/groups/application/group_invite_actions.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_invite_card.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Owner 2026-10-21: an invitation opened from Requests. The person may look
/// inside an open group (description, people, the latest messages, read-only)
/// before pressing «Accept» or «Decline»; a closed group shows only its name,
/// photo and description.
class GroupInviteScreen extends ConsumerStatefulWidget {
  const GroupInviteScreen({required this.inviteId, super.key});

  final String inviteId;

  @override
  ConsumerState<GroupInviteScreen> createState() => _GroupInviteScreenState();
}

class _GroupInviteScreenState extends ConsumerState<GroupInviteScreen> {
  bool? _busy;
  String? _error;

  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(ChatRoutes.inbox);
    }
  }

  Future<void> _answer(Translator t, bool accept) async {
    if (_busy != null) return;
    setState(() {
      _busy = accept;
      _error = null;
    });
    try {
      final joined =
          await answerGroupInvite(ref, widget.inviteId, accept: accept);
      if (!mounted) return;
      if (joined != null) {
        context.pushReplacement(GroupRoutes.group(joined));
      } else {
        _close();
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _busy = null;
        _error = errorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final preview = ref.watch(groupInvitePreviewProvider(widget.inviteId));
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: _close,
        ),
        title: Text(t.t('group.inv.title')),
      ),
      body: SafeArea(
        child: switch (preview) {
          AsyncData(:final value) => _body(t, value),
          AsyncError(:final error) => _failure(t, error),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }

  Widget _failure(Translator t, Object error) {
    final gone = error is ApiException &&
        (error.code == ApiErrorCodes.groupNotFound || error.statusCode == 404);
    if (!gone) {
      return CasesErrorView(
        error: error,
        t: t,
        onRetry: () =>
            ref.invalidate(groupInvitePreviewProvider(widget.inviteId)),
      );
    }
    return AppEmptyState(
      icon: AppIcons.linkOffRounded,
      title: t.t('group.inv.title'),
      message: t.t('group.inv.gone'),
      action: AppButton(
        key: const ValueKey('group-invite-back'),
        label: t.t('common.back'),
        variant: AppButtonVariant.secondary,
        height: AppSizes.touchTarget,
        onPressed: _close,
      ),
    );
  }

  Widget _body(Translator t, api.GroupInvitePreviewDetailDto p) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final g = p.invite;
    final description = p.description?.trim() ?? '';
    // Oldest first, like the chat itself.
    final messages = p.messages.reversed.toList();
    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: const EdgeInsets.all(AppSpacing.screenSide),
            children: [
              const SizedBox(height: AppSpacing.md),
              Center(
                child: GroupAvatar(name: g.title, url: g.avatarUrl, size: 96),
              ),
              const SizedBox(height: AppSpacing.lg),
              Text(
                g.title,
                textAlign: TextAlign.center,
                style: type.titleLarge.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t('group.inv.from', {
                  'name': groupInviterName(t.t, g.inviter),
                }),
                textAlign: TextAlign.center,
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
              Text(
                t.t(
                  'group.join.members',
                  {'count': context.digits(g.memberCount.toInt())},
                ),
                textAlign: TextAlign.center,
                style: type.bodySmall.copyWith(color: colors.textSecondary),
              ),
              if (description.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.lg),
                AppCard(
                  child: Text(
                    description,
                    style: type.body.copyWith(color: colors.text),
                  ),
                ),
              ],
              const SizedBox(height: AppSpacing.md),
              Text(
                t.t(p.readable ? 'group.inv.look' : 'group.inv.closed'),
                textAlign: TextAlign.center,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              if (p.readable && p.members.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xl),
                _heading(
                  t.plural('group.info.members', g.memberCount.toInt()),
                ),
                AppCard(
                  child: Column(
                    children: [
                      for (final m in p.members) _person(t, m),
                    ],
                  ),
                ),
              ],
              if (p.readable) ...[
                const SizedBox(height: AppSpacing.xl),
                _heading(t.t('group.inv.latest')),
                if (messages.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(
                      vertical: AppSpacing.md,
                    ),
                    child: Text(
                      t.t('group.empty.preview'),
                      textAlign: TextAlign.center,
                      style: type.bodySmall.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  )
                else
                  for (final m in messages) _message(t, m),
              ],
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.lg),
                Semantics(
                  liveRegion: true,
                  child: Text(
                    _error!,
                    textAlign: TextAlign.center,
                    style: type.bodySmall.copyWith(color: colors.dangerText),
                  ),
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
            AppSpacing.md,
          ),
          child: Row(
            children: [
              Expanded(
                child: AppButton(
                  key: const ValueKey('group-invite-screen-decline'),
                  label: t.t('group.inv.decline'),
                  variant: AppButtonVariant.secondary,
                  isLoading: _busy == false,
                  isEnabled: _busy == null,
                  onPressed: () => _answer(t, false),
                ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: AppButton(
                  key: const ValueKey('group-invite-screen-accept'),
                  label: t.t('group.inv.accept'),
                  isLoading: _busy ?? false,
                  isEnabled: _busy == null,
                  onPressed: () => _answer(t, true),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _heading(String text) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Text(
        text,
        style: type.bodySmall.copyWith(
          color: colors.textSecondary,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }

  String _name(Translator t, api.GroupPersonDto p) => groupInviterName(t.t, p);

  Widget _person(Translator t, api.GroupPersonDto m) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final name = _name(t, m);
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
      child: Row(
        children: [
          GroupAvatar(name: name, url: m.avatarUrl, size: 36),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Text(
              name,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.body.copyWith(color: colors.text),
            ),
          ),
        ],
      ),
    );
  }

  Widget _message(Translator t, api.GroupMessageDto m) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final sender = m.sender;
    final text = m.deleted
        ? ''
        : m.poll != null
            ? m.poll!.question
            : m.body.trim();
    if (text.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.sm),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: Container(
          constraints: const BoxConstraints(maxWidth: 480),
          padding: const EdgeInsets.symmetric(
            horizontal: AppSpacing.md,
            vertical: AppSpacing.sm,
          ),
          decoration: BoxDecoration(
            color: colors.surface,
            borderRadius: BorderRadius.circular(AppRadii.card),
            border: Border.all(color: colors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (sender != null)
                Text(
                  _name(t, sender),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(
                    color: colors.textSecondary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              Text(text, style: type.body.copyWith(color: colors.text)),
            ],
          ),
        ),
      ),
    );
  }
}
