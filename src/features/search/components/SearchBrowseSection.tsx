import React, { useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  Pressable,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { APP_TOP_HEADER_HEIGHT } from "@/components/AppTopHeader";
import AdMobNativeVideo from "@/components/AdMobNativeVideo";
import { styles } from "../styles/searchStyles";
import {
  type BrowseCategory,
  type RecentSearchItem,
  CARD_ROTATION_PATTERN,
} from "../types";

export function BrowseCategoryCard({
  category,
  index,
  onPress,
}: {
  category: BrowseCategory;
  index: number;
  onPress: (title: string) => void;
}) {
  const handlePress = useCallback(() => onPress(category.title), [category.title, onPress]);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.browseCard,
        { backgroundColor: category.color },
        pressed && styles.browseCardPressed,
      ]}
      onPress={handlePress}
    >
      <Text style={styles.browseCardTitle}>{category.title}</Text>
      <Image
        source={{ uri: category.imageUrl }}
        style={[
          styles.browseCardImage,
          { transform: [{ rotate: `${CARD_ROTATION_PATTERN[index % CARD_ROTATION_PATTERN.length]}deg` }] },
        ]}
        contentFit="cover"
        transition={100}
      />
    </Pressable>
  );
}

export interface SearchBrowseSectionProps {
  browseCategories: BrowseCategory[];
  onScroll: (event: any) => void;
  onGenrePress: (genreName: string) => void;
}

export const SearchBrowseSection = React.memo(function SearchBrowseSection({
  browseCategories,
  onScroll,
  onGenrePress,
}: SearchBrowseSectionProps) {
  const renderBrowseCategory = useCallback(
    ({ item, index }: { item: BrowseCategory; index: number }) => (
      <BrowseCategoryCard category={item} index={index} onPress={onGenrePress} />
    ),
    [onGenrePress]
  );

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={[styles.content, { paddingBottom: 146 }]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <AdMobNativeVideo />

      <View style={styles.browseSection}>
        <Text style={styles.browseTitle}>Browse all</Text>
        <FlatList
          data={browseCategories}
          keyExtractor={(category) => category.id}
          renderItem={renderBrowseCategory}
          numColumns={2}
          scrollEnabled={false}
          contentContainerStyle={styles.browseGridList}
          columnWrapperStyle={styles.browseGridRow}
        />
      </View>
    </ScrollView>
  );
});

export interface SearchRecentSectionProps {
  topInset: number;
  recentSearches: RecentSearchItem[];
  onScroll: (event: any) => void;
  onRecentSearchPress: (item: RecentSearchItem) => void;
  onRemoveRecentSearch: (id: string) => void;
}

export const SearchRecentSection = React.memo(function SearchRecentSection({
  topInset,
  recentSearches,
  onScroll,
  onRecentSearchPress,
  onRemoveRecentSearch,
}: SearchRecentSectionProps) {
  const renderItem = useCallback(
    ({ item }: { item: RecentSearchItem }) => (
      <Pressable
        key={item.id}
        style={({ pressed }) => [styles.recentRow, pressed && styles.recentRowPressed]}
        onPress={() => onRecentSearchPress(item)}
      >
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={[styles.recentThumb, item.type === "artist" && styles.recentThumbRound]}
            contentFit="cover"
            transition={100}
          />
        ) : (
          <View style={[styles.recentThumb, styles.recentThumbRound, styles.recentThumbFallback]}>
            <Ionicons name={item.icon ?? "search"} size={24} color={Colors.subtext} />
          </View>
        )}
        <View style={styles.recentInfo}>
          <Text style={styles.recentLabel} numberOfLines={1}>{item.label}</Text>
          {item.subtitle ? (
            <Text style={styles.recentSubtitle} numberOfLines={1}>{item.subtitle}</Text>
          ) : null}
        </View>
        <Pressable
          hitSlop={10}
          style={styles.recentActionBtn}
          onPress={(e) => { e.stopPropagation(); onRemoveRecentSearch(item.id); }}
        >
          <Ionicons name="close" size={18} color={Colors.subtext} />
        </Pressable>
      </Pressable>
    ),
    [onRecentSearchPress, onRemoveRecentSearch]
  );

  return (
    <FlatList
      style={styles.scrollView}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topInset + APP_TOP_HEADER_HEIGHT + 14, paddingBottom: 146 },
      ]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
      data={recentSearches}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={<Text style={styles.recentTitle}>Recent searches</Text>}
      ListEmptyComponent={
        <View style={styles.recentEmpty}>
          <Ionicons name="search-outline" size={34} color={Colors.subtext} />
          <Text style={styles.recentEmptyText}>No recent searches</Text>
        </View>
      }
      renderItem={renderItem}
    />
  );
});
