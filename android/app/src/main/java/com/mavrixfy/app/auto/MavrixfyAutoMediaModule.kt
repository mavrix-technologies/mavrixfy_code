package com.mavrixfy.app.auto

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class MavrixfyAutoMediaModule(
  reactContext: ReactApplicationContext
) : ReactContextBaseJavaModule(reactContext) {

  init {
    activeReactContext = reactContext
  }

  override fun getName(): String = MODULE_NAME

  @ReactMethod
  fun publishBrowseState(stateJson: String) {
    reactApplicationContext
      .getSharedPreferences(PREFERENCES_NAME, 0)
      .edit()
      .putString(KEY_BROWSE_STATE, stateJson)
      .apply()

    MavrixfyAutoService.refreshBrowsers()
  }

  @ReactMethod
  fun clearBrowseState() {
    reactApplicationContext
      .getSharedPreferences(PREFERENCES_NAME, 0)
      .edit()
      .remove(KEY_BROWSE_STATE)
      .apply()

    MavrixfyAutoService.refreshBrowsers()
  }

  @ReactMethod
  fun addListener(eventName: String) {
    // Required by React Native's NativeEventEmitter contract.
  }

  @ReactMethod
  fun removeListeners(count: Int) {
    // Required by React Native's NativeEventEmitter contract.
  }

  companion object {
    const val MODULE_NAME = "MavrixfyAutoMedia"
    const val PREFERENCES_NAME = "mavrixfy_auto_media"
    const val KEY_BROWSE_STATE = "browse_state"
    const val EVENT_PLAY_REQUEST = "MavrixfyAutoMediaPlayRequest"

    @Volatile
    private var activeReactContext: ReactApplicationContext? = null

    fun emitPlayRequest(mediaId: String): Boolean {
      val context = activeReactContext ?: return false
      return try {
        context
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit(EVENT_PLAY_REQUEST, mediaId)
        true
      } catch (_: Exception) {
        false
      }
    }
  }
}
