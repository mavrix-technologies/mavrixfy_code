import { StyleSheet,View } from "react-native";
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
  sectionGroup: {
    borderRadius: 16,
    backgroundColor: "rgba(255, 255, 255, 0.04)",
    overflow: "hidden",
  },
});
