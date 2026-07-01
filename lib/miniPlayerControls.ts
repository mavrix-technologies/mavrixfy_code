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
    void refreshMiniPlayerSecondaryControlPreference().then(setControl);

    const onChange = (next: MiniPlayerSecondaryControl) => setControl(next);
    listeners.add(onChange);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refreshMiniPlayerSecondaryControlPreference();
      }
    });

    return () => {
      listeners.delete(onChange);
      subscription.remove();
    };
  }, []);

  return control;
}
