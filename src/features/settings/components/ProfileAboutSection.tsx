import Colors from "@/constants/colors";
import { openPrivacyPolicy,openTermsOfService } from "@/lib/legal";
import { ActivityIndicator,StyleSheet,Text,View } from "react-native";
import { SimpleRow } from "./SettingsUIComponents";

export interface ProfileAboutSectionProps {
  appVersion: string;
  buildNumber: string;
  checkingStoreUpdate: boolean;
  onCheckStoreUpdate: () => void;
}

export function ProfileAboutSection({
  appVersion,
  buildNumber,
  checkingStoreUpdate,
  onCheckStoreUpdate,
}: ProfileAboutSectionProps) {
  return (
    <>
      <Text style={styles.sectionLabel}>ABOUT</Text>
      <View style={styles.sectionGroup}>
        <SimpleRow
          icon="information-circle-outline"
          title="Version"
          value={`v${appVersion} (${buildNumber})`}
        />
        <SimpleRow
          icon="arrow-up-circle-outline"
          title="Check for Updates"
          onPress={onCheckStoreUpdate}
          trailing={
            checkingStoreUpdate ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : undefined
          }
        />
        <SimpleRow
          icon="shield-checkmark-outline"
          title="Privacy Policy"
          onPress={() => void openPrivacyPolicy()}
        />
        <SimpleRow
          icon="document-text-outline"
          title="Terms of Service"
          onPress={() => void openTermsOfService()}
          isLast
        />
      </View>

      <View style={styles.footerCredits}>
        <Text style={styles.footerCreditsLabel}>DEVELOPED BY</Text>
        <Text style={styles.footerCreditsName}>Satvik Patel</Text>
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
  footerCredits: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 36,
    marginBottom: 16,
    gap: 3,
  },
  footerCreditsLabel: {
    color: "rgba(255, 255, 255, 0.35)",
    fontSize: 10.5,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  footerCreditsName: {
    color: "rgba(255, 255, 255, 0.8)",
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.6,
  },
});
