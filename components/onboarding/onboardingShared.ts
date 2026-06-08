import { StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";

export function haptic() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
}

export function hapticMedium() {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
}

export function hapticSuccess() {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export const onboardingStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingBottom: 4,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  stepWrap: { paddingHorizontal: 16, paddingTop: 16 },
  stepQ: { color: "#fff", fontSize: 30, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 20 },
  inputBox: {
    backgroundColor: "#2a2a2a", borderRadius: 6, paddingHorizontal: 14, paddingVertical: 16,
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
  },
  inputBoxText: { color: "#fff", fontSize: 16, fontFamily: "Inter_400Regular", flex: 1 },
  hint: { color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 8, fontFamily: "Inter_400Regular" },
  divider: { height: 1, backgroundColor: "rgba(255,255,255,0.1)", marginVertical: 20 },
  legalText: { color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 20, marginBottom: 12, fontFamily: "Inter_400Regular" },
  legalLink: { color: "#1DB954", fontFamily: "Inter_600SemiBold" },
  checkRow: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  checkText: { flex: 1, color: "rgba(255,255,255,0.7)", fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" },
  radio: {
    width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  radioChecked: { backgroundColor: "#1DB954", borderColor: "#1DB954" },
  nextBtn: {
    height: 52, borderRadius: 999, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", marginTop: 24,
  },
  nextBtnText: { color: "#000", fontSize: 16, fontFamily: "Inter_700Bold" },
  sheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "#1c1c1e", borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  sheetDoneRow: { alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 12 },
  sheetDoneText: { color: "#1DB954", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  pickerSheet: { backgroundColor: "#1c1c1e", borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  pickerDoneRow: {
    alignItems: "flex-end", paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.1)",
  },
  pickerDoneText: { color: "#1DB954", fontSize: 16, fontFamily: "Inter_600SemiBold" },
  picker: { backgroundColor: "transparent" },
  pickerItem: { color: "#fff", fontSize: 18, fontFamily: "Inter_400Regular" },
  genreGrid: {
    paddingHorizontal: 16,
    gap: 8,
  },
  genreGridRow: {
    gap: 8,
  },
  genreCard: {
    height: 100, borderRadius: 10, overflow: "hidden",
    justifyContent: "flex-end", padding: 10,
  },
  genreCardActive: { borderWidth: 2.5, borderColor: "#fff" },
  genreLabel: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  genreCheck: {
    position: "absolute", top: 8, right: 8, width: 22, height: 22,
    borderRadius: 11, backgroundColor: "#1DB954", alignItems: "center", justifyContent: "center",
  },
  artistSearchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: "#1c1c1e", borderRadius: 10, marginHorizontal: 16,
    paddingHorizontal: 12, height: 46, marginBottom: 12,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.08)",
  },
  artistSearchInput: { flex: 1, color: "#fff", fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  filterRow: { paddingHorizontal: 16, gap: 8, marginBottom: 14, alignItems: "center" },
  filterChip: {
    height: 36, paddingHorizontal: 16, borderRadius: 18,
    borderWidth: 1.5, borderColor: "rgba(255,255,255,0.25)",
    alignItems: "center", justifyContent: "center",
  },
  filterChipActive: { backgroundColor: "#1DB954", borderColor: "#1DB954" },
  filterChipText: { color: "#fff", fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterChipTextActive: { color: "#000" },
  artistItem: { alignItems: "center", gap: 8 },
  artistAvatarWrap: { overflow: "hidden", backgroundColor: "#1c1c1e" },
  artistAvatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#1c1c1e" },
  artistAvatarSelected: { borderWidth: 3, borderColor: "#1DB954" },
  artistCheckOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.35)", alignItems: "center", justifyContent: "center" },
  artistCheckBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: "#1DB954",
    alignItems: "center", justifyContent: "center",
  },
  artistName: { color: "rgba(255,255,255,0.65)", fontSize: 11, fontFamily: "Inter_500Medium", textAlign: "center", lineHeight: 15 },
  artistCountHint: { color: "rgba(255,255,255,0.5)", fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 8 },
  bottomBar: {
    position: "absolute", bottom: 0, left: 0, right: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: "#000",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  findingText: { color: "#fff", fontSize: 16, fontFamily: "Inter_500Medium" },
  greatCircle: { width: 76, height: 76, borderRadius: 38, overflow: "hidden", borderWidth: 2.5, borderColor: "#000", backgroundColor: "#1c1c1e" },
  greatText: { color: "#fff", fontSize: 24, fontFamily: "Inter_700Bold" },
});
