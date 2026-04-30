import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable } from "react-native";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Colors from "@/constants/colors";

/**
 * Debug component to show all promotions in the database
 * This helps diagnose why promotions aren't showing up
 * 
 * Usage: Add <PromotionBannerDebug /> to your home screen temporarily
 */
export default function PromotionBannerDebug() {
  const [promotions, setPromotions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    fetchAllPromotions();
  }, []);

  const fetchAllPromotions = async () => {
    try {
      console.log("[Debug] Fetching ALL promotions from Firestore...");
      
      // Fetch ALL promotions (no filters)
      const snapshot = await getDocs(collection(db, "promotions"));
      
      console.log("[Debug] Total promotions in database:", snapshot.docs.length);
      
      const promos = snapshot.docs.map((doc) => {
        const data = doc.data();
        console.log("[Debug] Promotion:", {
          id: doc.id,
          title: data.title,
          status: data.status,
          platforms: data.platforms,
          startDate: data.startDate,
          endDate: data.endDate,
        });
        return {
          id: doc.id,
          ...data,
        };
      });

      setPromotions(promos);
    } catch (error) {
      console.error("[Debug] Error fetching promotions:", error);
    } finally {
      setLoading(false);
    }
  };

  if (!expanded) {
    return (
      <Pressable
        style={styles.collapsedButton}
        onPress={() => setExpanded(true)}
      >
        <Text style={styles.collapsedText}>
          🐛 Debug: {promotions.length} promotions
        </Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>🐛 Promotion Debug Info</Text>
        <Pressable onPress={() => setExpanded(false)}>
          <Text style={styles.closeButton}>✕</Text>
        </Pressable>
      </View>

      {loading ? (
        <Text style={styles.text}>Loading...</Text>
      ) : promotions.length === 0 ? (
        <View>
          <Text style={styles.errorText}>❌ No promotions found in database</Text>
          <Text style={styles.helpText}>
            Create a promotion in the admin dashboard first.
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView}>
          <Text style={styles.text}>
            Total promotions: {promotions.length}
          </Text>
          <Text style={styles.text}>
            Today: {new Date().toISOString().split("T")[0]}
          </Text>
          <Text style={styles.divider}>─────────────────</Text>

          {promotions.map((promo, index) => {
            const today = new Date().toISOString().split("T")[0];
            const isActive = promo.status === "active";
            const isApp = promo.platforms === "app";
            const startValid = !promo.startDate || promo.startDate <= today;
            const endValid = !promo.endDate || promo.endDate >= today;
            const shouldShow = isActive && isApp && startValid && endValid;

            return (
              <View key={promo.id} style={styles.promoCard}>
                <Text style={styles.promoTitle}>
                  {index + 1}. {promo.title}
                </Text>
                
                <View style={styles.row}>
                  <Text style={styles.label}>Status:</Text>
                  <Text style={[styles.value, isActive ? styles.success : styles.error]}>
                    {promo.status} {isActive ? "✓" : "✗"}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Platform:</Text>
                  <Text style={[styles.value, isApp ? styles.success : styles.error]}>
                    {promo.platforms || "not set"} {isApp ? "✓" : "✗"}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Start Date:</Text>
                  <Text style={[styles.value, startValid ? styles.success : styles.error]}>
                    {promo.startDate || "none"} {startValid ? "✓" : "✗"}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>End Date:</Text>
                  <Text style={[styles.value, endValid ? styles.success : styles.error]}>
                    {promo.endDate || "none"} {endValid ? "✓" : "✗"}
                  </Text>
                </View>

                <View style={styles.row}>
                  <Text style={styles.label}>Media URL:</Text>
                  <Text style={styles.value} numberOfLines={1}>
                    {promo.mediaUrl ? "✓ Set" : "✗ None"}
                  </Text>
                </View>

                <View style={[styles.resultBox, shouldShow ? styles.successBox : styles.errorBox]}>
                  <Text style={styles.resultText}>
                    {shouldShow ? "✅ WILL SHOW" : "❌ WON'T SHOW"}
                  </Text>
                </View>

                {!shouldShow && (
                  <View style={styles.reasonBox}>
                    <Text style={styles.reasonTitle}>Why not showing:</Text>
                    {!isActive && <Text style={styles.reasonText}>• Status is not "active"</Text>}
                    {!isApp && <Text style={styles.reasonText}>• Platform is not "app"</Text>}
                    {!startValid && <Text style={styles.reasonText}>• Start date is in the future</Text>}
                    {!endValid && <Text style={styles.reasonText}>• End date has passed</Text>}
                  </View>
                )}
              </View>
            );
          })}

          <View style={styles.helpBox}>
            <Text style={styles.helpTitle}>💡 To fix:</Text>
            <Text style={styles.helpText}>1. Status must be "active"</Text>
            <Text style={styles.helpText}>2. Platform must be "app"</Text>
            <Text style={styles.helpText}>3. Start date must be today or earlier</Text>
            <Text style={styles.helpText}>4. End date must be today or later</Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  collapsedButton: {
    margin: 16,
    padding: 12,
    backgroundColor: "#ff6b6b",
    borderRadius: 8,
    alignItems: "center",
  },
  collapsedText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  container: {
    margin: 16,
    backgroundColor: "#1a1d23",
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#ff6b6b",
    maxHeight: 500,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2d33",
  },
  title: {
    color: "#ff6b6b",
    fontSize: 16,
    fontWeight: "700",
  },
  closeButton: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "700",
  },
  scrollView: {
    padding: 16,
  },
  text: {
    color: "#ddd",
    fontSize: 13,
    marginBottom: 4,
  },
  divider: {
    color: "#444",
    marginVertical: 12,
  },
  promoCard: {
    backgroundColor: "#252830",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#333",
  },
  promoTitle: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  label: {
    color: "#999",
    fontSize: 12,
  },
  value: {
    color: "#ddd",
    fontSize: 12,
    fontWeight: "600",
  },
  success: {
    color: "#51cf66",
  },
  error: {
    color: "#ff6b6b",
  },
  errorText: {
    color: "#ff6b6b",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
  },
  resultBox: {
    marginTop: 8,
    padding: 8,
    borderRadius: 6,
    alignItems: "center",
  },
  successBox: {
    backgroundColor: "rgba(81, 207, 102, 0.1)",
    borderWidth: 1,
    borderColor: "#51cf66",
  },
  errorBox: {
    backgroundColor: "rgba(255, 107, 107, 0.1)",
    borderWidth: 1,
    borderColor: "#ff6b6b",
  },
  resultText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "700",
  },
  reasonBox: {
    marginTop: 8,
    padding: 8,
    backgroundColor: "rgba(255, 107, 107, 0.05)",
    borderRadius: 6,
  },
  reasonTitle: {
    color: "#ff6b6b",
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
  },
  reasonText: {
    color: "#ff9999",
    fontSize: 11,
    marginLeft: 4,
  },
  helpBox: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "rgba(81, 207, 102, 0.05)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#51cf66",
  },
  helpTitle: {
    color: "#51cf66",
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  helpText: {
    color: "#aaa",
    fontSize: 12,
    marginBottom: 2,
  },
});
