// ignore_for_file: lines_longer_than_80_chars
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/contacts_sync/application/contacts_sync_providers.dart';

/// Owner 2026-10-13: People tab, before typing — one soft row "Find people
/// from your contacts" while the sync is off, a small "turn off" link when
/// it is on. People from the address book are not a separate block: they
/// sit in Recommended/Suggested with a small "From contacts" caption. The system permission dialog opens
/// by itself only once, the first time this is shown.
class ContactsSection extends ConsumerStatefulWidget {
  const ContactsSection({this.limit = 5, super.key});

  final int limit;

  @override
  ConsumerState<ContactsSection> createState() => _ContactsSectionState();
}

class _ContactsSectionState extends ConsumerState<ContactsSection> {
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) async {
      if (!mounted) return;
      final actions = ref.read(contactsSyncActionsProvider);
      if (actions.asked) return;
      final status = await ref.read(contactsSyncStatusProvider.future);
      if (!mounted || status.enabled) return;
      await _sync();
    });
  }

  Future<void> _sync() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      final ok = await ref.read(contactsSyncActionsProvider).sync();
      if (ok && mounted) {
        showAppSnackBar(context, ref.read(translatorProvider).t('phoneContacts.synced'));
      }
    } on ApiException catch (e) {
      if (mounted) {
        showAppSnackBar(context, apiErrorText(ref.read(translatorProvider), e));
      }
    } on Object {
      if (mounted) {
        showAppSnackBar(context, ref.read(translatorProvider).t('error.default.message'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(contactsSyncActionsProvider).remove();
      if (mounted) {
        showAppSnackBar(context, ref.read(translatorProvider).t('phoneContacts.removed'));
      }
    } on ApiException catch (e) {
      if (mounted) {
        showAppSnackBar(context, apiErrorText(ref.read(translatorProvider), e));
      }
    } on Object {
      if (mounted) {
        showAppSnackBar(context, ref.read(translatorProvider).t('error.default.message'));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final status = ref.watch(contactsSyncStatusProvider).value;
    if (status == null) return const SizedBox.shrink();
    if (!status.enabled) {
      return Padding(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenSide,
          AppSpacing.md,
          AppSpacing.screenSide,
          0,
        ),
        child: AppPressable(
          onTap: _sync,
          child: Row(
            children: [
              Icon(Icons.contacts_outlined, size: 22, color: colors.textSecondary),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Text(
                  t.t('phoneContacts.find'),
                  style: type.body.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        ),
      );
    }
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
      child: Align(
        alignment: AlignmentDirectional.centerStart,
        child: TextButton(
          onPressed: _busy ? null : _remove,
          child: Text(
            t.t('phoneContacts.disable'),
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ),
      ),
    );
  }
}
