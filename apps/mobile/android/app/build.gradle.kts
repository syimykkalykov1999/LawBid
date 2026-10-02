plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.lawbid.lawbid"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // Base id (owner decision, p12 leaf-1.4): the prod flavor ships under
        // exactly this id to Google Play; dev/staging add a suffix below so
        // all three variants install side by side on one device.
        applicationId = "com.lawbid.lawbid"
        // docs/01_FOUNDATION_AUTH.md §5.1: "Android 8+ (API 26+)". Also
        // covers local_auth's BiometricPrompt path (API 23+) and the SMS
        // Retriever API used for OTP autofill.
        minSdk = 26
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // App Links host (docs/01_FOUNDATION_AUTH.md §12: `lawbid.app`).
        // Override without editing this file, e.g.
        //   flutter build apk --flavor prod -t lib/main_prod.dart -Plawbid.deepLinkHost=example.com
        // It must match the host serving docs/deeplinks/assetlinks.json.
        manifestPlaceholders["deepLinkHost"] =
            (project.findProperty("lawbid.deepLinkHost") as String?) ?: "lawbid.app"
    }

    // Three installable variants side by side (p12 leaf-1.4), Flutter's
    // flavor convention: `flutter run --flavor dev -t lib/main_dev.dart`.
    // `app_name` feeds android:label in AndroidManifest.xml. The version
    // name is NOT suffixed: it is sent as X-App-Version and compared with
    // min_app_version_* on the server.
    buildFeatures {
        // AGP 9 disables resValue by default; the flavors need it for app_name.
        resValues = true
    }
    flavorDimensions += "env"
    productFlavors {
        create("dev") {
            dimension = "env"
            applicationIdSuffix = ".dev"
            resValue("string", "app_name", "LawBid")
        }
        create("staging") {
            dimension = "env"
            applicationIdSuffix = ".staging"
            resValue("string", "app_name", "LawBid Staging")
        }
        create("prod") {
            dimension = "env"
            // No suffix: this is the id published to Google Play.
            resValue("string", "app_name", "LawBid")
        }
    }

    signingConfigs {
        create("upload") {
            storeFile = System.getenv("ANDROID_KEYSTORE_PATH")?.let { file(it) }
            storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias = System.getenv("ANDROID_KEY_ALIAS")
            keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
        }
    }

    buildTypes {
        release {
            // docs/06 §7.4: the upload keystore comes from the environment
            // (ANDROID_KEYSTORE_PATH / _PASSWORD / KEY_ALIAS / KEY_PASSWORD, set
            // by the mobile-release workflow from GitHub Secrets); without it
            // the debug key keeps `flutter run --release` working locally.
            signingConfig = if (System.getenv("ANDROID_KEYSTORE_PATH") != null)
                signingConfigs.getByName("upload") else signingConfigs.getByName("debug")
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
