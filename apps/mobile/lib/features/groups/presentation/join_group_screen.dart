import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/widgets/group_avatar.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// What the invite link (or @username) points at; one read per code.
final _invitePreviewProvider =
    FutureProvider.autoDispose.family<api.GroupInvitePreviewDto, String>(
  (ref, code) => ref.watch(groupRepositoryProvider).preview(code),
);

/// An invite link / @username opened: shows the group and lets me join it,
/// ask to join, or open it when I am already in.
class JoinGroupScreen extends ConsumerStatefulWidget {
  const JoinGroupScreen({required this.code, super.key});

  final String code;

  @override
  ConsumerState<JoinGroupScreen> createState() => _JoinGroupScreenState();
}

class _JoinGroupScreenState extends ConsumerState<JoinGroupScreen> {
  var _joining = false;

  /// A request was sent from this screen.
  var _requested = false;

  /// The server refused the join (full, removed, ...): shown under the card.
  String? _joinError;

  Future<void> _join(Translator t, api.GroupInvitePreviewDto g) async {
    if (_joining) return;
    setState(() {
      _joining = true;
      _joinError = null;
    });
    try {
      final result = await ref.read(groupRepositoryProvider).join(g.code);
      ref.invalidate(groupsProvider);
      if (!mounted) return;
      if (result.status == api.GroupJoinResultDtoStatus.joined) {
        context.pushReplacement(GroupRoutes.group(result.groupId));
      } else {
        setState(() {
          _joining = false;
          _requested = true;
        });
      }
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _joining = false;
        _joinError = errorText(t, e);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final preview = ref.watch(_invitePreviewProvider(widget.code));
    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: _close,
        ),
        title: Text(t.t('group.join.title')),
      ),
      body: SafeArea(
        child: switch (preview) {
          AsyncData(:final value) => _card(t, value),
          AsyncError(:final error) => _failure(t, error),
          _ => const Center(child: CircularProgressIndicator()),
        },
      ),
    );
  }

  /// Back, or the chats list when this screen was opened from a link and
  /// there is nothing to go back to.
  void _close() {
    if (context.canPop()) {
      context.pop();
    } else {
      context.go(ChatRoutes.inbox);
    }
  }

  Widget _failure(Translator t, Object error) {
    final notFound =
        error is ApiException && error.code == ApiErrorCodes.groupNotFound;
    if (!notFound) {
      return CasesErrorView(
        error: error,
        t: t,
        onRetry: () => ref.invalidate(_invitePreviewProvider(widget.code)),
      );
    }
    return AppEmptyState(
      icon: AppIcons.linkOffRounded,
      title: t.t('group.join.notFoundTitle'),
      message: t.t('group.join.notFound'),
      action: AppButton(
        key: const ValueKey('join-back'),
        label: t.t('common.back'),
        variant: AppButtonVariant.secondary,
        height: AppSizes.touchTarget,
        onPressed: _close,
      ),
    );
  }

  Widget _card(Translator t, api.GroupInvitePreviewDto g) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final pending = g.requestPending || _requested;
    final description = g.description?.trim() ?? '';
    final label = g.alreadyMember
        ? t.t('group.join.open')
        : pending
            ? t.t('group.join.requested')
            : g.requiresApproval
                ? t.t('group.join.request')
                : t.t('group.join.join');
    final subtitle = [
      t.t('group.create.type.${g.type.json}'),
      if (g.username != null) '@${g.username}',
    ].join(' · ');
    return ListView(
      padding: const EdgeInsets.all(AppSpacing.screenSide),
      children: [
        const SizedBox(height: AppSpacing.xl),
        Center(
          child: GroupAvatar(name: g.title, url: g.avatarUrl, size: 96),
        ),
        const SizedBox(height: AppSpacing.lg),
        Text(
          g.title,
          textAlign: TextAlign.center,
          style: typography.titleLarge.copyWith(color: colors.text),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          subtitle,
          textAlign: TextAlign.center,
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
        const SizedBox(height: AppSpacing.xs),
        Text(
          t.t('group.join.members', {'count': '${g.memberCount.toInt()}'}),
          textAlign: TextAlign.center,
          style: typography.bodySmall.copyWith(color: colors.textSecondary),
        ),
        if (description.isNotEmpty) ...[
          const SizedBox(height: AppSpacing.xl),
          AppCard(
            child: Text(
              description,
              style: typography.body.copyWith(color: colors.text),
            ),
          ),
        ],
        if (g.requiresApproval && !g.alreadyMember && !pending) ...[
          const SizedBox(height: AppSpacing.md),
          Text(
            t.t('group.join.approvalNote'),
            textAlign: TextAlign.center,
            style: typography.caption.copyWith(color: colors.textSecondary),
          ),
        ],
        if (_joinError != null) ...[
          const SizedBox(height: AppSpacing.lg),
          Semantics(
            liveRegion: true,
            child: Text(
              _joinError!,
              textAlign: TextAlign.center,
              style: typography.bodySmall.copyWith(color: colors.dangerText),
            ),
          ),
        ],
        const SizedBox(height: AppSpacing.xl),
        AppButton(
          key: const ValueKey('join-submit'),
          label: label,
          isLoading: _joining,
          isEnabled: g.alreadyMember || !pending,
          onPressed: g.alreadyMember
              ? () => context.pushReplacement(GroupRoutes.group(g.id))
              : () => _join(t, g),
        ),
      ],
    );
  }
}
