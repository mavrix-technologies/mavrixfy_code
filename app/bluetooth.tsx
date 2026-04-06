import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Device } from "react-native-ble-plx";
import Colors from "@/constants/colors";
import { safeGoBack } from "@/utils/navigation";
import { BLUETOOTH_STATE, BluetoothState, bluetoothService } from "@/lib/bluetooth";

type ScannedDevice = {
  id: string;
  name: string;
  rssi: number | null;
};

const SCAN_TIMEOUT_MS = 12000;

function sortDevices(devices: ScannedDevice[], connectedId: string | null): ScannedDevice[] {
  return [...devices].sort((a, b) => {
    const aConnected = connectedId === a.id ? 1 : 0;
    const bConnected = connectedId === b.id ? 1 : 0;
    if (aConnected !== bConnected) return bConnected - aConnected;

    const aRssi = a.rssi ?? -999;
    const bRssi = b.rssi ?? -999;
    if (aRssi !== bRssi) return bRssi - aRssi;

    return a.name.localeCompare(b.name);
  });
}

export default function BluetoothScreen() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === "ios" ? 8 : Platform.OS === "web" ? 67 : insets.top;
  const bottomInset = Platform.OS === "web" ? 10 : Math.max(10, insets.bottom);

  const [bluetoothState, setBluetoothState] = useState<BluetoothState>(BLUETOOTH_STATE.Unknown);
  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<ScannedDevice[]>([]);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const scanTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bluetoothAvailable = bluetoothService.isAvailable();
  const isBluetoothOn = bluetoothState === BLUETOOTH_STATE.PoweredOn;
  const canScan = bluetoothAvailable && isBluetoothOn && !isScanning;

  const clearScanTimeout = useCallback(() => {
    if (!scanTimeoutRef.current) return;
    clearTimeout(scanTimeoutRef.current);
    scanTimeoutRef.current = null;
  }, []);

  const stopScan = useCallback(() => {
    clearScanTimeout();
    bluetoothService.stopScan();
    setIsScanning(false);
  }, [clearScanTimeout]);

  useEffect(() => {
    const subscription = bluetoothService.onStateChange((state) => {
      setBluetoothState(state);
      if (state !== BLUETOOTH_STATE.PoweredOn) {
        stopScan();
        setConnectedId(null);
      }
    }, true);

    return () => {
      stopScan();
      subscription.remove();
    };
  }, [stopScan]);

  const statusText = useMemo(() => {
    switch (bluetoothState) {
      case BLUETOOTH_STATE.PoweredOn:
        return "Bluetooth On";
      case BLUETOOTH_STATE.PoweredOff:
        return "Bluetooth Off";
      case BLUETOOTH_STATE.Unauthorized:
        return "Permission Denied";
      case BLUETOOTH_STATE.Unsupported:
        return "Bluetooth Unsupported";
      case BLUETOOTH_STATE.Resetting:
        return "Resetting Adapter";
      default:
        return "Checking Bluetooth";
    }
  }, [bluetoothState]);

  const upsertDevice = useCallback((device: Device) => {
    const nextDevice: ScannedDevice = {
      id: device.id,
      name: device.name?.trim() || device.localName?.trim() || "Unnamed Device",
      rssi: typeof device.rssi === "number" ? device.rssi : null,
    };

    setDevices((prev) => {
      const map = new Map(prev.map((item) => [item.id, item]));
      map.set(nextDevice.id, { ...map.get(nextDevice.id), ...nextDevice });
      return sortDevices(Array.from(map.values()), connectedId);
    });
  }, [connectedId]);

  const startScan = useCallback(async () => {
    if (!bluetoothAvailable) {
      Alert.alert("Bluetooth Unavailable", "Bluetooth module is unavailable in this build.");
      return;
    }

    const permission = await bluetoothService.ensureScanPermissions();
    if (!permission.granted) {
      Alert.alert("Permission Required", permission.message ?? "Bluetooth permission is required.");
      return;
    }

    const state = await bluetoothService.getState();
    if (state !== BLUETOOTH_STATE.PoweredOn) {
      Alert.alert("Bluetooth Off", "Please turn on Bluetooth and try again.");
      return;
    }

    setDevices([]);
    setIsScanning(true);
    clearScanTimeout();
    scanTimeoutRef.current = setTimeout(() => {
      stopScan();
    }, SCAN_TIMEOUT_MS);

    bluetoothService.startScan(
      (found) => upsertDevice(found),
      (error) => {
        stopScan();
        Alert.alert("Scan Failed", error?.message?.trim() || "Failed to scan for nearby devices.");
      }
    );
  }, [bluetoothAvailable, clearScanTimeout, stopScan, upsertDevice]);

  const handleConnect = useCallback(
    async (item: ScannedDevice) => {
      if (!isBluetoothOn) {
        Alert.alert("Bluetooth Off", "Turn on Bluetooth before connecting.");
        return;
      }

      stopScan();
      setConnectingId(item.id);
      try {
        await bluetoothService.connect(item.id);
        setConnectedId(item.id);
        setDevices((prev) => sortDevices(prev, item.id));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to connect to device.";
        Alert.alert("Connection Failed", message);
      } finally {
        setConnectingId(null);
      }
    },
    [isBluetoothOn, stopScan]
  );

  const handleDisconnect = useCallback(
    async (item: ScannedDevice) => {
      setConnectingId(item.id);
      try {
        await bluetoothService.disconnect(item.id);
        if (connectedId === item.id) {
          setConnectedId(null);
          setDevices((prev) => sortDevices(prev, null));
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to disconnect device.";
        Alert.alert("Disconnect Failed", message);
      } finally {
        setConnectingId(null);
      }
    },
    [connectedId]
  );

  return (
    <View style={[styles.container, { paddingTop: topInset }]}>
      <View style={styles.topBar}>
        <Pressable style={styles.topIconButton} onPress={safeGoBack} hitSlop={10}>
          <Ionicons name="chevron-back" size={22} color={Colors.text} />
        </Pressable>
        <Text style={styles.topTitle}>Devices</Text>
        <View style={styles.topIconButton} />
      </View>

      <View style={styles.statusRow}>
        <View style={[styles.statusDot, isBluetoothOn ? styles.statusDotOn : styles.statusDotOff]} />
        <Text style={styles.statusText}>{statusText}</Text>
      </View>

      <View style={styles.controlsRow}>
        <Pressable style={[styles.actionBtn, !canScan && styles.actionBtnDisabled]} onPress={startScan} disabled={!canScan}>
          <Ionicons name="scan-outline" size={15} color={Colors.text} />
          <Text style={styles.actionBtnText}>{isScanning ? "Scanning..." : "Scan"}</Text>
        </Pressable>
        <Pressable
          style={[styles.actionBtn, styles.secondaryBtn, !isScanning && styles.actionBtnDisabled]}
          onPress={stopScan}
          disabled={!isScanning}
        >
          <Ionicons name="stop-circle-outline" size={15} color={Colors.text} />
          <Text style={styles.actionBtnText}>Stop</Text>
        </Pressable>
      </View>

      {!bluetoothAvailable ? (
        <Text style={styles.inlineInfoText}>Bluetooth module unavailable in this build.</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Device</Text>
        <View style={styles.currentRow}>
          <View style={styles.deviceIconWrap}>
            <Ionicons name="phone-portrait-outline" size={18} color={Colors.text} />
          </View>
          <View style={styles.deviceTextWrap}>
            <Text style={styles.deviceTitle}>This Phone</Text>
            <Text style={styles.deviceSub}>Current playback output</Text>
          </View>
          <Ionicons name="checkmark-circle" size={18} color={Colors.primary} />
        </View>
      </View>

      <View style={[styles.section, styles.devicesSection]}>
        <Text style={styles.sectionTitle}>Nearby Devices</Text>
        <FlatList
          data={devices}
          keyExtractor={(item) => item.id}
          style={styles.deviceList}
          contentContainerStyle={[
            styles.deviceListContent,
            devices.length === 0 && styles.deviceListContentEmpty,
            { paddingBottom: bottomInset + 6 },
          ]}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={8}
          windowSize={6}
          removeClippedSubviews={Platform.OS === "android"}
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>
                {isScanning ? "Scanning nearby devices..." : "No nearby devices found yet."}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const isConnected = connectedId === item.id;
            const isBusy = connectingId === item.id;

            return (
              <View style={[styles.deviceRow, isConnected && styles.deviceRowConnected]}>
                <View style={styles.deviceIconWrap}>
                  <Ionicons
                    name={isConnected ? "bluetooth" : "bluetooth-outline"}
                    size={18}
                    color={Colors.text}
                  />
                </View>
                <View style={styles.deviceTextWrap}>
                  <Text numberOfLines={1} style={styles.deviceTitle}>
                    {item.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.deviceSub}>
                    RSSI {item.rssi ?? "--"} dBm
                  </Text>
                </View>
                <Pressable
                  style={[styles.connectBtn, isConnected && styles.disconnectBtn]}
                  onPress={() => (isConnected ? handleDisconnect(item) : handleConnect(item))}
                  disabled={isBusy}
                >
                  {isBusy ? (
                    <ActivityIndicator size="small" color={Colors.text} />
                  ) : (
                    <Text style={[styles.connectBtnText, isConnected && styles.disconnectBtnText]}>
                      {isConnected ? "Disconnect" : "Connect"}
                    </Text>
                  )}
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: 16,
  },
  topBar: {
    height: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  topIconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  topTitle: {
    color: Colors.text,
    fontSize: 22,
    fontFamily: "Inter_800ExtraBold",
    letterSpacing: -0.2,
  },
  statusRow: {
    marginTop: 2,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOn: {
    backgroundColor: "#57DF7B",
  },
  statusDotOff: {
    backgroundColor: "#FF6D7A",
  },
  statusText: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  controlsRow: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.cardBorderStrong,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  secondaryBtn: {
    flex: 0,
    minWidth: 88,
    paddingHorizontal: 12,
  },
  actionBtnDisabled: {
    opacity: 0.55,
  },
  actionBtnText: {
    color: Colors.text,
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  inlineInfoText: {
    marginTop: 8,
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  section: {
    marginTop: 12,
  },
  devicesSection: {
    flex: 1,
    minHeight: 0,
  },
  sectionTitle: {
    color: Colors.text,
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginBottom: 8,
  },
  currentRow: {
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorderStrong,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deviceList: {
    flex: 1,
  },
  deviceListContent: {
    gap: 8,
  },
  deviceListContentEmpty: {
    flexGrow: 1,
    justifyContent: "center",
  },
  emptyWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
  },
  emptyText: {
    color: Colors.subtext,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    paddingVertical: 16,
  },
  deviceRow: {
    minHeight: 62,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  deviceRowConnected: {
    borderColor: Colors.cardBorderStrong,
    backgroundColor: Colors.surfaceLight,
  },
  deviceIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: Colors.cardBorder,
  },
  deviceTextWrap: {
    flex: 1,
    minWidth: 0,
  },
  deviceTitle: {
    color: Colors.text,
    fontSize: 13.5,
    fontFamily: "Inter_600SemiBold",
  },
  deviceSub: {
    marginTop: 1,
    color: Colors.subtext,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  connectBtn: {
    minWidth: 92,
    height: 32,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: Colors.cardBorderStrong,
    backgroundColor: Colors.surfaceLight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
  },
  disconnectBtn: {
    backgroundColor: "rgba(255, 107, 107, 0.12)",
    borderColor: "rgba(255, 107, 107, 0.3)",
  },
  connectBtnText: {
    color: Colors.text,
    fontSize: 11.5,
    fontFamily: "Inter_600SemiBold",
  },
  disconnectBtnText: {
    color: "#FFD0D0",
  },
});
