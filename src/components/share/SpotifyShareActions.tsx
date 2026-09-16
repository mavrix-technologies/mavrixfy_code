import React, { memo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  Ionicons,
  FontAwesome,
  FontAwesome5,
  MaterialCommunityIcons,
} from "@expo/vector-icons";
import { styles } from "./shareModalStyles";

export interface ActionRowProps {
  onCopyLink: () => void;
  onWhatsApp: () => void;
  onInstagram: () => void;
  onTelegram: () => void;
  onMessages: () => void;
  onMore: () => void;
}

export const SpotifyShareActions = memo(function SpotifyShareActions({
  onCopyLink,
  onWhatsApp,
  onInstagram,
  onTelegram,
  onMessages,
  onMore,
}: ActionRowProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.socialActionsScroll}
    >
      <Pressable
        style={({ pressed }) => [styles.socialBtn, pressed && styles.btnPressed]}
        onPress={onCopyLink}
      >
        <View style={[styles.iconCircle, styles.copyLinkBg]}>
          <Ionicons name="link" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.socialLabel} numberOfLines={1}>
          Copy link
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.socialBtn, pressed && styles.btnPressed]}
        onPress={onWhatsApp}
      >
        <View style={[styles.iconCircle, styles.whatsappBg]}>
          <FontAwesome name="whatsapp" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.socialLabel} numberOfLines={1}>
          WhatsApp
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.socialBtn, pressed && styles.btnPressed]}
        onPress={onInstagram}
      >
        <View style={[styles.iconCircle, styles.storiesBg]}>
          <MaterialCommunityIcons name="instagram" size={24} color="#FFFFFF" />
        </View>
        <Text style={styles.socialLabel} numberOfLines={1}>
          Stories
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.socialBtn, pressed && styles.btnPressed]}
        onPress={onTelegram}
      >
        <View style={[styles.iconCircle, styles.telegramBg]}>
          <FontAwesome5 name="telegram-plane" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.socialLabel} numberOfLines={1}>
          Telegram
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.socialBtn, pressed && styles.btnPressed]}
        onPress={onMessages}
      >
        <View style={[styles.iconCircle, styles.messagesBg]}>
          <Ionicons name="chatbubble-ellipses" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.socialLabel} numberOfLines={1}>
          Messages
        </Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.socialBtn, pressed && styles.btnPressed]}
        onPress={onMore}
      >
        <View style={[styles.iconCircle, styles.moreBg]}>
          <Ionicons name="ellipsis-horizontal" size={22} color="#FFFFFF" />
        </View>
        <Text style={styles.socialLabel} numberOfLines={1}>
          More
        </Text>
      </Pressable>
    </ScrollView>
  );
});
