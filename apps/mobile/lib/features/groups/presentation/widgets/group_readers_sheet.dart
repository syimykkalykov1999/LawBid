import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/groups/presentation/poll/poll_voters_sheet.dart'
    show PollVoterRow;
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Groups WhatsApp parity («Данные» of my message): who has read it, from
/// the members' read marks (GET …/readers), as «N/M» over the list. The
/// same sheet and rows as «Who voted» of a poll (`showPollVotersSheet`).
Future<void> showGroupReadersSheet(
  BuildContext context, {
  required String groupId,
  required api.GroupMessageDto message,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => _ReadersSheet(groupId: groupId, message: message),
    );

class _ReadersSheet extends ConsumerStatefulWidget {
  const _ReadersSheet({required this.groupId, required this.message});

  final String groupId;
  final api.GroupMessageDto message;

  @override
  ConsumerState<_ReadersSheet> createState() => _ReadersSheetState();
}

class _ReadersSheetState extends ConsumerState<_ReadersSheet> {
  api.GroupMessageReadersDto? _data;
  Object? _error;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final data = await ref
          .read(groupRepositoryProvider)
          .readers(widget.groupId, widget.message.id);
      if (!mounted) return;
      setState(() {
        _data = data;
        _loading = false;
      });
    } on Object catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e;
        _loading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final height = MediaQuery.sizeOf(context).height * 0.8;
    final data = _data;
    return SafeArea(
      child: SizedBox(
        height: height,
        child: Padding(
          padding: const EdgeInsetsDirectional.fromSTEB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            0,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const AppSheetHandle(),
              Row(
                children: [
                  AppIcon(AppIcons.doneAllRounded, color: colors.iconTint),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      t.t('chat.seen'),
                      style:
                          typography.titleMedium.copyWith(color: colors.text),
                    ),
                  ),
                  if (data != null)
                    Text(
                      context.digits(
                        '${data.readers.length}/${data.recipients}',
                      ),
                      key: const ValueKey('group-readers-count'),
                      style: typography.body.copyWith(
                        color: colors.textSecondary,
                      ),
                    ),
                ],
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                groupMessagePreview(t, widget.message),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: typography.bodySmall.copyWith(
                  color: colors.textSecondary,
                ),
              ),
              const SizedBox(height: AppSpacing.md),
              Expanded(child: _body(colors, typography)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _body(AppColorTokens colors, AppTypographyTokens typography) {
    final t = ref.read(translatorProvider);
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final error = _error;
    if (error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              errorText(t, error),
              textAlign: TextAlign.center,
              style: typography.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.md),
            AppButton(
              label: t.t('common.retry'),
              variant: AppButtonVariant.secondary,
              onPressed: _load,
            ),
          ],
        ),
      );
    }
    final readers = _data?.readers ?? const <api.GroupPersonDto>[];
    return ListView.builder(
      padding: const EdgeInsets.only(bottom: AppSpacing.xl),
      itemCount: readers.length,
      itemBuilder: (context, i) => PollVoterRow(person: readers[i], t: t),
    );
  }
}
