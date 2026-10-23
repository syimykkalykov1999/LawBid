import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/search/presentation/widgets/public_attorney_tile.dart';

/// Owner 2026-10-22 (guest browsing): the Search tab without an account —
/// a field that narrows the public directory on the phone (name,
/// @username, practice, state, firm). The server's people / posts / cases
/// search needs a token; it comes to guests with the API change.
class GuestSearchScreen extends ConsumerStatefulWidget {
  const GuestSearchScreen({super.key});

  @override
  ConsumerState<GuestSearchScreen> createState() => _GuestSearchScreenState();
}

class _GuestSearchScreenState extends ConsumerState<GuestSearchScreen> {
  final _controller = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.sm,
                AppSpacing.screenSide,
                AppSpacing.xs,
              ),
              child: AppTextField(
                key: const ValueKey('guest-search-field'),
                controller: _controller,
                hintText: t.t('guest.search.hint'),
                semanticLabel: t.t('search.field'),
                leading: AppIcon(
                  AppIcons.searchRounded,
                  color: colors.textSecondary,
                ),
                textInputAction: TextInputAction.search,
                onChanged: (v) => setState(() => _query = v),
              ),
            ),
            Expanded(child: PublicDirectoryList(filter: _query)),
          ],
        ),
      ),
    );
  }
}
