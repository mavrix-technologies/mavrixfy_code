import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import {
  Linking,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { triggerImpact } from "@/lib/haptics";
import { showGlobalToast } from "@/utils/globalToast";
import { closeShareSheet, subscribeShareSheet, type ShareSheetData } from "@/utils/shareSheet";
import { extractArtworkColors, type ArtworkPalette } from "@/lib/colorExtractor";
import { SpotifyPosterCard } from "./share/SpotifyPosterCard";
import { SpotifyShareActions } from "./share/SpotifyShareActions";
import {
  styles,
  buildShareMessage,
  DEFAULT_CARD_PALETTES,
} from "./share/shareModalStyles";

export const ShareModal = memo(function ShareModal() {
  const [data, setData] = useState<ShareSheetData | null>(null);
  const [selectedBgColor, setSelectedBgColor] = useState<string>(DEFAULT_CARD_PALETTES[0]);
  const [palette, setPalette] = useState<ArtworkPalette | null>(null);

  useEffect(() => {
    return subscribeShareSheet((incoming) => {
      setData(incoming);
      if (incoming?.imageUrl) {
        extractArtworkColors(incoming.imageUrl)
          .then((extracted) => {
            setPalette(extracted);
            const initialColor =
              extracted.background ||
              (extracted.swatches && extracted.swatches[0]) ||
              DEFAULT_CARD_PALETTES[0];
            setSelectedBgColor(initialColor);
          })
          .catch(() => {
            setSelectedBgColor(DEFAULT_CARD_PALETTES[0]);
          });
      } else {
        setSelectedBgColor(DEFAULT_CARD_PALETTES[0]);
      }
    });
  }, []);

  const cardColorOptions = useMemo(() => {
    if (palette?.swatches && palette.swatches.length > 0) {
      return palette.swatches.slice(0, 5);
    }
    const list: string[] = [];
    if (palette?.background) list.push(palette.background);
    if (palette?.accent && !list.includes(palette.accent)) {
      list.push(palette.accent);
    }
    for (const c of DEFAULT_CARD_PALETTES) {
      if (!list.includes(c)) list.push(c);
    }
    return list.slice(0, 5);
  }, [palette]);

  const handleClose = useCallback(() => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    closeShareSheet();
  }, []);

  const handleSelectColor = useCallback((color: string) => {
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    setSelectedBgColor(color);
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!data) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Medium);
    const linkToCopy = data.url || "https://mavrixfy-git-main-team-mavrix.vercel.app";
    await Clipboard.setStringAsync(linkToCopy);
    showGlobalToast("Link copied to clipboard!");
    closeShareSheet();
  }, [data]);

  const handleWhatsApp = useCallback(async () => {
    if (!data) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    const text = buildShareMessage(data);
    closeShareSheet();

    try {
      await Linking.openURL(`whatsapp://send?text=${encodeURIComponent(text)}`);
    } catch {
      try {
        await Linking.openURL(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`);
      } catch {
        await Clipboard.setStringAsync(text);
        showGlobalToast("Link copied to clipboard!");
      }
    }
  }, [data]);

  const handleInstagramStories = useCallback(async () => {
    if (!data) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    closeShareSheet();

    const linkToCopy = data.url || "https://mavrixfy-git-main-team-mavrix.vercel.app";
    await Clipboard.setStringAsync(linkToCopy);
    showGlobalToast("Link copied! Opening Instagram...");

    try {
      await Linking.openURL("instagram://");
    } catch {
      try {
        await Linking.openURL("https://instagram.com");
      } catch {
        // Fallback
      }
    }
  }, [data]);

  const handleTelegram = useCallback(async () => {
    if (!data) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    const text = buildShareMessage(data);
    closeShareSheet();

    try {
      await Linking.openURL(`tg://msg?text=${encodeURIComponent(text)}`);
    } catch {
      try {
        await Linking.openURL(`https://t.me/share/url?url=${encodeURIComponent(data.url || "")}&text=${encodeURIComponent(text)}`);
      } catch {
        await Clipboard.setStringAsync(text);
        showGlobalToast("Link copied to clipboard!");
      }
    }
  }, [data]);

  const handleMessages = useCallback(async () => {
    if (!data) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    const text = buildShareMessage(data);
    const smsUrl =
      Platform.OS === "ios"
        ? `sms:&body=${encodeURIComponent(text)}`
        : `sms:?body=${encodeURIComponent(text)}`;

    closeShareSheet();
    try {
      await Linking.openURL(smsUrl);
    } catch {
      await Clipboard.setStringAsync(text);
      showGlobalToast("Link copied to clipboard!");
    }
  }, [data]);

  const handleSystemMore = useCallback(async () => {
    if (!data) return;
    void triggerImpact(Haptics.ImpactFeedbackStyle.Light);
    const text = buildShareMessage(data);
    closeShareSheet();

    try {
      await Share.share(
        Platform.OS === "ios"
          ? {
              title: data.title,
              message: text,
              url: data.url,
            }
          : {
              title: data.title,
              message: text,
            },
        {
          dialogTitle: `Share ${data.title}`,
          tintColor: Colors.primary,
        }
      );
    } catch {
      // user dismissed system share
    }
  }, [data]);

  if (!data) return null;

  return (
    <Modal
      visible={!!data}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleClose}
          accessibilityLabel="Dismiss share modal"
          accessibilityRole="button"
        />

        <View style={styles.sheetContainer}>
          <View style={styles.dragHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetHeaderTitle}>Share</Text>
            <Pressable
              onPress={handleClose}
              style={styles.closeBtn}
              hitSlop={8}
              accessibilityLabel="Close share modal"
              accessibilityRole="button"
            >
              <Ionicons name="close" size={20} color="#FFFFFF" />
            </Pressable>
          </View>

          <SpotifyPosterCard
            data={data}
            selectedBgColor={selectedBgColor}
            cardColorOptions={cardColorOptions}
            onSelectColor={handleSelectColor}
          />

          <SpotifyShareActions
            onCopyLink={handleCopyLink}
            onWhatsApp={handleWhatsApp}
            onInstagram={handleInstagramStories}
            onTelegram={handleTelegram}
            onMessages={handleMessages}
            onMore={handleSystemMore}
          />
        </View>
      </View>
    </Modal>
  );
});

export default ShareModal;
