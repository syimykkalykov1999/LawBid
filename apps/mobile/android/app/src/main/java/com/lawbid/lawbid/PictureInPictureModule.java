/*
 * Copyright @ 2017-present 8x8, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Copied from Jitsi Meet, android/sdk/src/main/java/org/jitsi/meet/sdk/
// PictureInPictureModule.java, commit f765042bf280cbd7dcd4a9bbdb63b09e9e4d3259
// (https://github.com/jitsi/jitsi-meet, Apache-2.0; THIRD_PARTY_NOTICES.md).
// Edge changes only (LawBid 2026-10-28, calls variant A): the React Native
// module base, @ReactMethod / Promise and JitsiMeetLogger are replaced by a
// plain class the Flutter activity holds (MainActivity, channel
// `lawbid/call_pip`); package renamed. The PiP logic itself is unchanged.

package com.lawbid.lawbid;

import android.annotation.TargetApi;
import android.app.Activity;
import android.app.ActivityManager;
import android.app.PictureInPictureParams;
import android.util.Log;
import android.util.Rational;

import static android.content.Context.ACTIVITY_SERVICE;

class PictureInPictureModule {

    public static final String NAME = "PictureInPicture";
    private static final String TAG = NAME;

    private static boolean isSupported;
    private boolean isEnabled;
    private final Activity activity;

    public PictureInPictureModule(Activity activity) {
        this.activity = activity;

        ActivityManager am = (ActivityManager) activity.getSystemService(ACTIVITY_SERVICE);

        // Android Go devices don't support PiP. There doesn't seem to be a better way to detect it than
        // to use ActivityManager.isLowRamDevice().
        // https://stackoverflow.com/questions/58340558/how-to-detect-android-go
        isSupported = !am.isLowRamDevice();
    }

    /**
     * Enters Picture-in-Picture (mode) for the current {@link Activity}.
     * Supported on Android API >= 26 (Oreo) only.
     *
     * @throws IllegalStateException if {@link #isPictureInPictureSupported()}
     * returns {@code false} or if the activity is {@code null}.
     * @throws RuntimeException if
     * {@link Activity#enterPictureInPictureMode(PictureInPictureParams)} fails.
     * That method can also throw a {@link RuntimeException} in various cases,
     * including when the activity is not visible (paused or stopped), if the
     * screen is locked or if the user has an activity pinned.
     */
    @TargetApi(26)
    public void enterPictureInPicture() {
        if (!isEnabled) {
            return;
        }

        if (!isSupported) {
            throw new IllegalStateException("Picture-in-Picture not supported");
        }

        Activity currentActivity = activity;

        if (currentActivity == null) {
            throw new IllegalStateException("No current Activity!");
        }

        Log.i(TAG, "Entering Picture-in-Picture");

        PictureInPictureParams.Builder builder
            = new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(1, 1));

        // https://developer.android.com/reference/android/app/Activity.html#enterPictureInPictureMode(android.app.PictureInPictureParams)
        //
        // The system may disallow entering picture-in-picture in various cases,
        // including when the activity is not visible, if the screen is locked
        // or if the user has an activity pinned.
        if (!currentActivity.enterPictureInPictureMode(builder.build())) {
            throw new RuntimeException("Failed to enter Picture-in-Picture");
        }
    }

    public void setPictureInPictureEnabled(Boolean enabled) {
        this.isEnabled = enabled;
    }

    public boolean isPictureInPictureSupported() {
        return isSupported;
    }

    public String getName() {
        return NAME;
    }
}
