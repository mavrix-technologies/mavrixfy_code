import type { FlatList } from "react-native";

// Lets the tab bar return the Home feed to its start without coupling it to the
// Home screen module (which keeps Fast Refresh boundaries intact).
export const globalHomeScrollRef = { current: null as FlatList<any> | null };
