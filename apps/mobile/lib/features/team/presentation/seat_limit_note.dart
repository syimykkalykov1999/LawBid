import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/data/seat_limit_repository.dart';

/// Owner 2026-10-05: "You can add up to N assistants. Need more? Send a
/// request and we'll raise your limit." Shows a waiting request or the
/// admin's answer.
class SeatLimitNote extends ConsumerWidget {
  const SeatLimitNote({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final s = ref.watch(seatLimitProvider).value;
    if (s == null) return const SizedBox.shrink();
    final status = switch (s.requestStatus) {
      'pending' => t.t('team.limit.pending', {'count': '${s.requestedSeats}'}),
      'rejected' => [
          t.t('team.limit.rejected'),
          if ((s.decisionNote ?? '').trim().isNotEmpty) s.decisionNote!.trim(),
        ].join(' '),
      _ => null,
    };
    return Container(
      key: const ValueKey('seat-limit-note'),
      padding: const EdgeInsets.all(AppSpacing.md),
      decoration: BoxDecoration(
        color: colors.goldTint,
        borderRadius: BorderRadius.circular(AppRadii.field),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(
            t.t(
              s.isPersonal ? 'team.limit.personal' : 'team.limit.default',
              {'count': '${s.limit}'},
            ),
            style: type.bodySmall.copyWith(color: colors.text),
          ),
          if (status != null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              status,
              key: const ValueKey('seat-limit-status'),
              style: type.caption.copyWith(color: colors.goldDark),
            ),
          ],
          if (!s.hasPending)
            Align(
              alignment: AlignmentDirectional.centerStart,
              child: TextButton(
                key: const ValueKey('seat-limit-request'),
                onPressed: () => _request(context, ref, s),
                child: Text(
                  t.t('team.limit.request'),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
            ),
        ],
      ),
    );
  }

  Future<void> _request(
    BuildContext context,
    WidgetRef ref,
    SeatLimitState s,
  ) async {
    final t = ref.read(translatorProvider);
    final sent = await showDialog<bool>(
      context: context,
      builder: (_) => _RequestDialog(min: s.limit + 1),
    );
    if ((sent ?? false) && context.mounted) {
      ref.invalidate(seatLimitProvider);
      showAppSnackBar(context, t.t('team.limit.sent'));
    }
  }
}

class _RequestDialog extends ConsumerStatefulWidget {
  const _RequestDialog({required this.min});

  final int min;

  @override
  ConsumerState<_RequestDialog> createState() => _RequestDialogState();
}

class _RequestDialogState extends ConsumerState<_RequestDialog> {
  late final _seats = TextEditingController(text: '${widget.min}');
  final _note = TextEditingController();
  bool _busy = false;

  /// docs: SEATS_HARD_CAP on the server.
  static const _max = 50;

  @override
  void dispose() {
    _seats.dispose();
    _note.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final t = ref.read(translatorProvider);
    final n = int.tryParse(_seats.text.trim()) ?? 0;
    setState(() => _busy = true);
    try {
      await ref.read(seatLimitRepositoryProvider).request(
            seats: n,
            note: _note.text.trim().isEmpty ? null : _note.text.trim(),
          );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (!mounted) return;
      setState(() => _busy = false);
      showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final n = int.tryParse(_seats.text.trim()) ?? 0;
    final ok = n >= widget.min && n <= _max && !_busy;
    return AlertDialog(
      backgroundColor: colors.surface,
      title: Text(t.t('team.limit.request.title')),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AppTextField(
              key: const ValueKey('seat-limit-seats'),
              controller: _seats,
              label: t.t('team.limit.request.seats'),
              keyboardType: TextInputType.number,
              inputFormatters: [
                FilteringTextInputFormatter.digitsOnly,
                LengthLimitingTextInputFormatter(2),
              ],
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppSpacing.md),
            AppTextField(
              key: const ValueKey('seat-limit-reason'),
              controller: _note,
              hintText: t.t('team.limit.request.note'),
              maxLines: 3,
              maxLength: 1000,
              textCapitalization: TextCapitalization.sentences,
            ),
          ],
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.of(context).pop(false),
          child: Text(t.t('common.cancel')),
        ),
        TextButton(
          key: const ValueKey('seat-limit-send'),
          onPressed: ok ? _send : null,
          child: Text(t.t('team.limit.request.send')),
        ),
      ],
    );
  }
}
