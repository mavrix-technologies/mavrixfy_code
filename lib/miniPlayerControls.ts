import { useEffect, useState } from "react";
import { AppState, InteractionManager } from "react-native";
import { getSettings, type MiniPlayerSecondaryControl } from "@/lib/storage";

let cachedControl: MiniPlayerSecondaryControl = "queue";
const listeners = new Set<(value: MiniPlayerSecondaryControl) => void>();

function notifyListeners(value: MiniPlayerSecondaryControl): void {
  InteractionManager.runAfterInteractions(() => {
    listeners.forEach((listener) => listener(value));
  });
}

export function setMiniPlayerSecondaryControlPreference(value: MiniPlayerSecondaryControl): void {
  cachedControl = value;
  notifyListeners(value);
}

async function refreshMiniPlayerSecondaryControlPreference(): Promise<MiniPlayerSecondaryControl> {
  const settings = await getSettings();
  cachedControl = settings.miniPlayerSecondaryControl;
  notifyListeners(cachedControl);
  return cachedControl;
}

export function useMiniPlayerSecondaryControl(): MiniPlayerSecondaryControl {
  const [control, setControl] = useState<MiniPlayerSecondaryControl>(cachedControl);

  useEffect(() => {
    let mounted = true;
    
    function updateControl(val: MiniPlayerSecondaryControl) {
      if (mounted) {
        // react-doctor-disable-next-line react-doctor/no-impure-state-updater -- intentional state update in callback
        setControl(val);
      }
    }

    void refreshMiniPlayerSecondaryControlPreference().then(updateControl);

    listeners.add(updateControl);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshMiniPlayerSecondaryControlPreference();
      }
    });

    return () => {
      mounted = false;
      listeners.delete(updateControl);
      subscription.remove();
    };
  }, []);

  return control;
}
