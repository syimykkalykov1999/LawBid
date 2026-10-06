# Release shrinking (R8) rules — store release 2026-10-06. The Flutter
# Gradle plugin picks this file up automatically for release builds.

# flutter_stripe: the Stripe SDK references optional push-provisioning
# classes that are not shipped; without these R8 stops with
# "Missing classes detected".
-dontwarn com.stripe.android.pushProvisioning.**

# flutter_webrtc (in-app calls): JNI looks these classes up by name.
-keep class org.webrtc.** { *; }

# flutter_callkit_incoming: the full-screen incoming-call UI is started by
# class name from the notification.
-keep class com.hiennv.flutter_callkit_incoming.** { *; }
