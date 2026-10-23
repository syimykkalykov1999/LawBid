import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/auth/application/passkeys_providers.dart';
import 'package:lawbid/features/auth/data/passkey_authenticator.dart';

/// Owner 2026-10-22 (checklist §1): Settings → Security → «Sign-in keys»
/// — the account's passkeys (iCloud Keychain / Google Password Manager /
/// a security key) with «Add a key» and a delete per row. Hidden while
/// the flag is off or the device cannot do passkeys.
class PasskeysSection extends ConsumerStatefulWidget {
  const PasskeysSection({super.key});

  @override
  ConsumerState<PasskeysSection> createState() => _PasskeysSectionState();
}

class _PasskeysSectionState extends ConsumerState<PasskeysSection> {
  bool _busy = false;

  Future<void> _add() async {
    if (_busy) return;
    final t = ref.read(translatorProvider);
    setState(() => _busy = true);
    try {
      await ref.read(myPasskeysProvider.notifier).add();
      if (mounted) showAppSnackBar(context, t.t('passkey.added'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, passkeyErrorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _remove(PasskeyInfo key) async {
    final t = ref.read(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final ok = await showDialog<bool>(
      context: context,
      builder: (dialog) => AppAlertDialog(
        backgroundColor: colors.sheet,
        title: Text(t.t('passkey.remove.title')),
        content: Text(t.t('passkey.remove.body', {'name': key.name})),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(false),
            child: Text(t.t('common.cancel')),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialog).pop(true),
            child: Text(
              t.t('common.delete'),
              style: TextStyle(color: colors.danger),
            ),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    try {
      await ref.read(myPasskeysProvider.notifier).remove(key.id);
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final available = ref.watch(passkeysAvailableProvider).value ?? false;
    if (!available) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final keys = ref.watch(myPasskeysProvider);
    final rows = keys.value ?? const <PasskeyInfo>[];
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.lg),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          AppListSection(
            title: t.t('passkey.section'),
            children: [
              if (keys.isLoading && rows.isEmpty)
                const Padding(
                  padding: EdgeInsets.all(AppSpacing.md),
                  child: AppSkeleton(height: 40),
                )
              else if (rows.isEmpty)
                Padding(
                  padding: const EdgeInsets.all(AppSpacing.md),
                  child: Text(
                    t.t('passkey.empty'),
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                )
              else
                for (final k in rows)
                  _PasskeyRow(
                    key: ValueKey('passkey-${k.id}'),
                    passkey: k,
                    subtitle: k.lastUsedAt == null
                        ? t.t('passkey.added.on', {'date': f.date(k.createdAt)})
                        : t.t(
                            'passkey.lastUsed',
                            {'date': f.date(k.lastUsedAt!)},
                          ),
                    deleteLabel: t.t('common.delete'),
                    onDelete: () => _remove(k),
                  ),
            ],
          ),
          const SizedBox(height: AppSpacing.sm),
          AppButton(
            key: const ValueKey('passkey-add'),
            label: t.t('passkey.add'),
            icon: AppIcons.fingerprint,
            variant: AppButtonVariant.secondary,
            isLoading: _busy,
            onPressed: _add,
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            t.t('passkey.hint'),
            style: type.caption.copyWith(color: colors.textSecondary),
          ),
        ],
      ),
    );
  }
}

class _PasskeyRow extends StatelessWidget {
  const _PasskeyRow({
    required this.passkey,
    required this.subtitle,
    required this.deleteLabel,
    required this.onDelete,
    super.key,
  });

  final PasskeyInfo passkey;
  final String subtitle;
  final String deleteLabel;
  final VoidCallback onDelete;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Padding(
      padding: const EdgeInsetsDirectional.fromSTEB(
        AppSpacing.md,
        AppSpacing.sm,
        AppSpacing.xs,
        AppSpacing.sm,
      ),
      child: Row(
        children: [
          const AppIconMedallion(icon: AppIcons.fingerprint),
          const SizedBox(width: AppSpacing.md),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  passkey.name,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.body.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w500,
                  ),
                ),
                Text(
                  subtitle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ),
          AppIconButton(
            icon: AppIcon(AppIcons.deleteOutlineRounded, color: colors.danger),
            semanticLabel: deleteLabel,
            onPressed: onDelete,
          ),
        ],
      ),
    );
  }
}

/// The text for a passkey failure: the device's own reasons first, then
/// the API's.
String passkeyErrorText(Translator t, Object error) {
  if (error is PasskeyAuthenticatorException) {
    return switch (error.failure) {
      PasskeyFailure.cancelled => t.t('passkey.error.cancelled'),
      PasskeyFailure.noCredentials => t.t('passkey.error.noCredentials'),
      PasskeyFailure.unsupported => t.t('passkey.error.unsupported'),
      PasskeyFailure.other => t.t('passkey.error.generic'),
    };
  }
  return errorText(t, error);
}
