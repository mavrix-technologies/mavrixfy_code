import { StyleSheet,Text,View } from "react-native";
import { SimpleRow } from "./SettingsUIComponents";

export interface ProfileLibrarySectionProps {
  onDownloadedSongs: () => void;
  onImportSongs: () => void;
  onClearCache: () => void;
}

export function ProfileLibrarySection({
  onDownloadedSongs,
  onImportSongs,
  onClearCache,
}: ProfileLibrarySectionProps) {
  return (
    <>
      <Text style={styles.sectionLabel}>LIBRARY & DATA</Text>
      <View style={styles.sectionGroup}>
        <SimpleRow
          icon="arrow-down-circle-outline"
          title="Downloaded Songs"
          onPress={onDownloadedSongs}
        />
        <SimpleRow
          icon="cloud-upload-outline"
          title="Import Local Audio"
          onPress={onImportSongs}
        />
        <SimpleRow
          icon="trash-bin-outline"
          title="Clear Cache & History"
          onPress={onClearCache}
          isLast
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    color: "rgba(255, 255, 255, 0.38)",
    fontSize: 12.5,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.9,
    marginTop: 26,
    marginBottom: 10,
    marginLeft: 6,
  },
  sectionGroup: {
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
  },
});
