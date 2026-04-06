import { PermissionsAndroid, Platform } from "react-native";
import type { BleError, BleManager, Device, Subscription } from "react-native-ble-plx";

export interface BluetoothPermissionResult {
  granted: boolean;
  message?: string;
}

export const BLUETOOTH_STATE = {
  Unknown: "Unknown",
  Resetting: "Resetting",
  Unsupported: "Unsupported",
  Unauthorized: "Unauthorized",
  PoweredOff: "PoweredOff",
  PoweredOn: "PoweredOn",
} as const;

export type BluetoothState = (typeof BLUETOOTH_STATE)[keyof typeof BLUETOOTH_STATE];

type BlePlxModule = typeof import("react-native-ble-plx");
const EMPTY_SUBSCRIPTION: Subscription = { remove: () => {} } as Subscription;

class BluetoothService {
  private manager: BleManager | null = null;
  private bleModule: BlePlxModule | null = null;
  private scanning = false;

  private loadBleModule(): BlePlxModule | null {
    if (this.bleModule) return this.bleModule;

    try {
      this.bleModule = require("react-native-ble-plx") as BlePlxModule;
      return this.bleModule;
    } catch {
      return null;
    }
  }

  private getManager(): BleManager | null {
    if (this.manager) return this.manager;

    const module = this.loadBleModule();
    if (!module) return null;

    try {
      this.manager = new module.BleManager();
      return this.manager;
    } catch {
      return null;
    }
  }

  public isAvailable(): boolean {
    return Boolean(this.getManager());
  }

  public onStateChange(listener: (state: BluetoothState) => void, emitCurrentState = true): Subscription {
    const manager = this.getManager();
    if (!manager) {
      if (emitCurrentState) {
        listener(BLUETOOTH_STATE.Unsupported);
      }
      return EMPTY_SUBSCRIPTION;
    }

    return manager.onStateChange((state) => {
      listener((state as BluetoothState) ?? BLUETOOTH_STATE.Unknown);
    }, emitCurrentState);
  }

  public async getState(): Promise<BluetoothState> {
    const manager = this.getManager();
    if (!manager) return BLUETOOTH_STATE.Unsupported;

    try {
      const state = await manager.state();
      return (state as BluetoothState) ?? BLUETOOTH_STATE.Unknown;
    } catch {
      return BLUETOOTH_STATE.Unknown;
    }
  }

  public async ensureScanPermissions(): Promise<BluetoothPermissionResult> {
    if (!this.getManager()) {
      return {
        granted: false,
        message: "Bluetooth module is unavailable in this build.",
      };
    }

    if (Platform.OS !== "android") {
      return { granted: true };
    }

    const rawApiLevel = typeof Platform.Version === "number"
      ? Platform.Version
      : Number.parseInt(String(Platform.Version), 10);
    const apiLevel = Number.isFinite(rawApiLevel) ? rawApiLevel : 0;

    if (apiLevel >= 31) {
      const permissions = [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ];
      const result = await PermissionsAndroid.requestMultiple(permissions);
      const allGranted = permissions.every(
        (permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED
      );

      return allGranted
        ? { granted: true }
        : {
            granted: false,
            message: "Bluetooth permissions are required to scan and connect devices.",
          };
    }

    const location = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
    );
    if (location === PermissionsAndroid.RESULTS.GRANTED) {
      return { granted: true };
    }

    return {
      granted: false,
      message: "Location permission is required on this Android version for Bluetooth scan.",
    };
  }

  public startScan(
    onDeviceFound: (device: Device) => void,
    onScanError?: (error: BleError) => void
  ): void {
    const manager = this.getManager();
    if (!manager) {
      this.scanning = false;
      onScanError?.({ message: "Bluetooth module is unavailable in this build." } as BleError);
      return;
    }

    if (this.scanning) {
      this.stopScan();
    }

    this.scanning = true;
    manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) {
        this.scanning = false;
        manager.stopDeviceScan();
        onScanError?.(error);
        return;
      }

      if (device) {
        onDeviceFound(device);
      }
    });
  }

  public stopScan(): void {
    if (!this.scanning) return;
    const manager = this.getManager();
    manager?.stopDeviceScan();
    this.scanning = false;
  }

  public async connect(deviceId: string): Promise<Device> {
    const manager = this.getManager();
    if (!manager) {
      throw new Error("Bluetooth module is unavailable in this build.");
    }

    const connected = await manager.connectToDevice(deviceId, { timeout: 15000 });
    return connected.discoverAllServicesAndCharacteristics();
  }

  public async disconnect(deviceId: string): Promise<void> {
    const manager = this.getManager();
    if (!manager) return;

    const connected = await manager.isDeviceConnected(deviceId);
    if (connected) {
      await manager.cancelDeviceConnection(deviceId);
    }
  }
}

export const bluetoothService = new BluetoothService();
