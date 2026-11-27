package com.lawbid.lawbid

import android.app.Activity
import android.os.Build
import android.view.View
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowInsetsAnimation
import androidx.annotation.RequiresApi
import io.flutter.embedding.android.FlutterView
import java.lang.ref.WeakReference

/**
 * Owner bug 27.11 (Samsung S26 Ultra, Android 16): leave the app with the
 * keyboard open (comments, chat, search …), come back — the keyboard is
 * gone, but the screen is still laid out above a keyboard-sized empty area.
 *
 * Cause (phone log 08:38:24–08:39:16): leaving cancels the IME hide
 * (`ImeTracker … onCancelled at PHASE_CLIENT_ON_CONTROLS_CHANGED`); on
 * return the system hides the IME while the window is being restored
 * (`HIDE_UNSPECIFIED_WINDOW`, `WindowInsets changed: ime:null`, then
 * `onTimeout at PHASE_CLIENT_REPORT_REQUESTED_VISIBLE_TYPES`). Flutter
 * 3.50.0's engine `ImeSyncDeferringInsetsCallback` defers that inset change
 * behind its IME animation bookkeeping and ends up re-sending the old
 * keyboard height (flutter/flutter#191156, fixed upstream by
 * flutter/flutter#191453, merged 2026-11-10, not in 3.50.0).
 *
 * Fix, as the workaround posted on #191156 and as Android documents
 * (`View.getRootWindowInsets` is the window's current state): when the
 * window regains focus, and after every IME inset animation has ended, read
 * the real window insets; when the system says the keyboard is not visible,
 * ask for a fresh inset dispatch and (Android 15+, edge-to-edge) hand those
 * insets to the [FlutterView] directly, so Flutter never keeps a keyboard
 * height the system no longer has. With the keyboard visible
 * nothing is touched (the engine's own animation stays in charge), and when
 * Flutter already has the right values the call changes nothing.
 *
 * Remove when the app is on a Flutter stable that contains #191453.
 */
internal class ImeInsetsRefresher(activity: Activity) {
    private val activity = WeakReference(activity)
    private var flutterView: WeakReference<FlutterView>? = null

    /** Watches IME animations on the decor view without taking them away
     *  from the Flutter view below (DISPATCH_MODE_CONTINUE_ON_SUBTREE). */
    fun install() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val decor = activity.get()?.window?.decorView ?: return
        decor.setWindowInsetsAnimationCallback(ImeEndCallback(::refresh))
    }

    /** Call from Activity.onWindowFocusChanged(true). */
    fun onWindowFocused() = refresh()

    private fun refresh() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
        val view = findFlutterView() ?: return
        // Posted: runs after the engine's own onEnd / inset dispatch of this
        // frame, so the real state is the last word.
        view.post { applyIfKeyboardHidden(view) }
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun applyIfKeyboardHidden(view: FlutterView) {
        if (!view.isAttachedToWindow) return
        val insets = view.rootWindowInsets ?: return
        if (insets.isVisible(WindowInsets.Type.ime())) return
        // The normal path first: a fresh dispatch through the engine's own
        // listener (enough whenever its IME bookkeeping is idle).
        view.requestApplyInsets()
        // Android 15+ is always edge-to-edge, so the window's root insets are
        // exactly what the Flutter view receives: hand them over directly,
        // as the engine itself does from its animation callback, in case its
        // bookkeeping is still stuck in an animation that never ended.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            view.onApplyWindowInsets(WindowInsets(insets))
        }
    }

    private fun findFlutterView(): FlutterView? {
        flutterView?.get()?.let { if (it.isAttachedToWindow) return it }
        val decor = activity.get()?.window?.decorView ?: return null
        val found = search(decor) ?: return null
        flutterView = WeakReference(found)
        return found
    }

    private fun search(view: View): FlutterView? {
        if (view is FlutterView) return view
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                search(view.getChildAt(i))?.let { return it }
            }
        }
        return null
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private class ImeEndCallback(private val onImeEnd: () -> Unit) :
        WindowInsetsAnimation.Callback(
            WindowInsetsAnimation.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE,
        ) {
        override fun onProgress(
            insets: WindowInsets,
            runningAnimations: MutableList<WindowInsetsAnimation>,
        ): WindowInsets = insets

        override fun onEnd(animation: WindowInsetsAnimation) {
            if ((animation.typeMask and WindowInsets.Type.ime()) != 0) onImeEnd()
        }
    }
}
