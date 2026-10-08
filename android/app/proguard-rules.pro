# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# @generated begin expo-build-properties - expo prebuild (DO NOT MODIFY)
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.doublesymmetry.** { *; }
-keep class expo.modules.updates.** { *; }
-keep class kotlin.** { *; }
-keep class kotlin.reflect.** { *; }
# @generated end expo-build-properties

# Play Store & Firebase keep rules
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# React Native & Networking
-keepattributes *Annotation*,Signature,InnerClasses,EnclosingMethod
-dontwarn okhttp3.**
-dontwarn okio.**
# Mavrixfy YouTube Music
-keep class com.metrolist.innertubex.** { *; }
-keep class io.ktor.** { *; }
-keep class org.schabi.newpipe.extractor.** { *; }

# YouTube optional desktop APIs
# Rhino's optional JavaBeans/JVM scripting adapters and Ktor's IDE debugger probe
# reference desktop-only APIs. Android extraction uses Rhino directly, not JSR-223.
-dontwarn java.beans.BeanDescriptor
-dontwarn java.beans.BeanInfo
-dontwarn java.beans.IntrospectionException
-dontwarn java.beans.Introspector
-dontwarn java.beans.PropertyDescriptor
-dontwarn java.lang.management.ManagementFactory
-dontwarn java.lang.management.RuntimeMXBean
-dontwarn javax.script.ScriptEngineFactory
