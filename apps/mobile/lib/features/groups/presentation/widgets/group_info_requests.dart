import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// The join requests of a closed group with approval: avatar, name, when,
/// Approve / Decline. Admins only (the server refuses anyone else).
Future<void> showGroupRequestsSheet(
  BuildContext context, {
  required String groupId,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => ConstrainedBox(
        constraints: BoxConstraints(
          maxHeight: MediaQuery.sizeOf(sheet).height * 0.85,
        ),
        child: _RequestsSheet(groupId: groupId),
      ),
    );

class _RequestsSheet extends ConsumerStatefulWidget {
  const _RequestsSheet({required this.groupId});

  final String groupId;

  @override
  ConsumerState<_RequestsSheet> createState() => _RequestsSheetState();
}

class _RequestsSheetState extends ConsumerState<_RequestsSheet> {
  /// The user whose request is being answered right now.
  String? _busyId;

  Future<void> _answer(
    api.GroupJoinRequestDto request, {
    required bool approve,
  }) async {
    final t = ref.read(translatorProvider);
    final id = request.user.userId;
    final name = request.user.displayName ?? request.user.username ?? '';
    setState(() => _busyId = id);
    try {
      await ref
          .read(groupRepositoryProvider)
          .answerRequest(widget.groupId, id, approve: approve);
      if (!mounted) return;
      ref
        ..invalidate(groupRequestsProvider(widget.groupId))
        ..invalidate(groupDetailProvider(widget.groupId));
      showAppSnackBar(
        context,
        t.t(
          approve
              ? 'group.info.requests.approved'
              : 'group.info.requests.declined',
          {'name': name},
        ),
      );
    } on Object catch (e) {
      if (mounted) {
        showAppSnackBar(context, errorText(t, e));
        // Someone else may have answered it: show the real list.
        ref.invalidate(groupRequestsProvider(widget.groupId));
      }
    } finally {
      if (mounted) setState(() => _busyId = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(groupRequestsProvider(widget.groupId));

    return SafeArea(
      top: false,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.only(top: AppSpacing.md),
            child: AppSheetHandle(),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenSide,
              AppSpacing.sm,
              AppSpacing.screenSide,
              AppSpacing.sm,
            ),
            child: Align(
              alignment: AlignmentDirectional.centerStart,
              child: Text(
                t.t('group.info.requests.title'),
                style: type.titleMedium.copyWith(color: colors.text),
              ),
            ),
          ),
          Flexible(
            child: async.when(
              skipLoadingOnReload: true,
              loading: () => const Padding(
                padding: EdgeInsets.all(AppSpacing.xxl),
                child: Center(
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (e, _) => Padding(
                padding: const EdgeInsets.all(AppSpacing.xl),
                child: AppErrorState(
                  message: errorText(t, e),
                  retryLabel: t.t('error.retry'),
                  onRetry: () =>
                      ref.invalidate(groupRequestsProvider(widget.groupId)),
                ),
              ),
              data: (list) => list.isEmpty
                  ? Padding(
                      padding: const EdgeInsets.all(AppSpacing.xxl),
                      child: Text(
                        t.t('group.info.requests.empty'),
                        textAlign: TextAlign.center,
                        style: type.body.copyWith(color: colors.textSecondary),
                      ),
                    )
                  : ListView.separated(
                      shrinkWrap: true,
                      padding: const EdgeInsets.fromLTRB(
                        AppSpacing.screenSide,
                        0,
                        AppSpacing.screenSide,
                        AppSpacing.lg,
                      ),
                      itemCount: list.length,
                      separatorBuilder: (_, __) =>
                          const SizedBox(height: AppSpacing.sm),
                      itemBuilder: (_, i) => _RequestRow(
                        request: list[i],
                        busy: _busyId == list[i].user.userId,
                        locked: _busyId != null,
                        onAnswer: ({required approve}) =>
                            _answer(list[i], approve: approve),
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RequestRow extends ConsumerWidget {
  const _RequestRow({
    required this.request,
    required this.busy,
    required this.locked,
    required this.onAnswer,
  });

  final api.GroupJoinRequestDto request;
  final bool busy;
  final bool locked;
  final void Function({required bool approve}) onAnswer;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final user = request.user;
    final name = user.displayName ?? user.username ?? '';
    final avatar = user.avatarUrl;

    return Container(
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.surface,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: colors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppAvatar(
                initials: avatarInitials(name),
                imageProvider: avatar == null
                    ? null
                    : appNetworkImage(
                        avatar,
                        decodeWidthFor(AppSizes.cardAvatar),
                      ),
              ),
              const SizedBox(width: AppSpacing.md),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    Text(
                      t.t(
                        'group.info.requests.sent',
                        {'date': formats.date(request.createdAt)},
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.caption.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            children: [
              Expanded(
                child: AppButton(
                  key: ValueKey('group-request-decline-${user.userId}'),
                  label: t.t('group.info.requests.decline'),
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  isEnabled: !locked,
                  onPressed: locked ? null : () => onAnswer(approve: false),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: AppButton(
                  key: ValueKey('group-request-approve-${user.userId}'),
                  label: t.t('group.info.requests.approve'),
                  height: AppSizes.touchTarget,
                  isLoading: busy,
                  isEnabled: !locked,
                  onPressed: locked ? null : () => onAnswer(approve: true),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
