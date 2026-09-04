import {
  type ResultFilter,
  type SearchResults,
  EMPTY_RESULTS,
} from "@/lib/searchRepository";

export interface SearchScreenState {
  query: string;
  results: SearchResults;
  searchDisplayQuery: string;
  resultFilter: ResultFilter;
  searchLoading: boolean;
  isSearchMode: boolean;
  suggestions: string[];
  suggestionsOpen: boolean;
}

export type SearchScreenAction =
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_SEARCH_LOADING"; loading: boolean }
  | { type: "SEARCH_SUCCESS"; results: SearchResults; displayQuery: string }
  | { type: "SEARCH_RESET"; displayQuery: string }
  | { type: "SET_SUGGESTIONS"; suggestions: string[] }
  | { type: "SET_SUGGESTIONS_OPEN"; open: boolean }
  | { type: "CLOSE_SUGGESTIONS" }
  | { type: "SELECT_QUERY"; query: string; resetFilter?: boolean }
  | { type: "APPLY_PROGRAMMATIC_QUERY"; query: string }
  | { type: "SET_RESULT_FILTER"; filter: ResultFilter }
  | { type: "ACTIVATE_SEARCH_MODE" }
  | { type: "CLEAR_SEARCH" }
  | { type: "CANCEL_SEARCH_MODE" };

export function searchScreenReducer(
  state: SearchScreenState,
  action: SearchScreenAction
): SearchScreenState {
  switch (action.type) {
    case "SET_QUERY": {
      const trimmed = action.query.trim();
      if (trimmed.length < 2) {
        return {
          ...state,
          query: action.query,
          resultFilter: "all",
          suggestions: [],
          suggestionsOpen: false,
        };
      }
      return {
        ...state,
        query: action.query,
        suggestionsOpen: true,
      };
    }
    case "SET_SEARCH_LOADING":
      return {
        ...state,
        searchLoading: action.loading,
      };
    case "SEARCH_SUCCESS":
      return {
        ...state,
        results: action.results,
        searchDisplayQuery: action.displayQuery,
        searchLoading: false,
      };
    case "SEARCH_RESET":
      return {
        ...state,
        results: EMPTY_RESULTS,
        searchDisplayQuery: action.displayQuery,
        searchLoading: false,
      };
    case "SET_SUGGESTIONS":
      return {
        ...state,
        suggestions: action.suggestions,
        suggestionsOpen: action.suggestions.length > 0,
      };
    case "SET_SUGGESTIONS_OPEN":
      return {
        ...state,
        suggestionsOpen: action.open,
      };
    case "CLOSE_SUGGESTIONS":
      return {
        ...state,
        suggestionsOpen: false,
        suggestions: [],
      };
    case "SELECT_QUERY":
      return {
        ...state,
        isSearchMode: true,
        query: action.query,
        suggestionsOpen: false,
        suggestions: [],
        ...(action.resetFilter ? { resultFilter: "all" } : {}),
      };
    case "APPLY_PROGRAMMATIC_QUERY":
      return {
        ...state,
        isSearchMode: true,
        suggestionsOpen: false,
        query: action.query,
      };
    case "SET_RESULT_FILTER":
      return {
        ...state,
        resultFilter: state.query.trim().length < 2 ? "all" : action.filter,
      };
    case "ACTIVATE_SEARCH_MODE":
      return {
        ...state,
        isSearchMode: true,
      };
    case "CLEAR_SEARCH":
      return {
        ...state,
        query: "",
        suggestionsOpen: false,
        suggestions: [],
        results: EMPTY_RESULTS,
        searchDisplayQuery: "",
        searchLoading: false,
      };
    case "CANCEL_SEARCH_MODE":
      return {
        ...state,
        isSearchMode: false,
        query: "",
        suggestionsOpen: false,
        suggestions: [],
        results: EMPTY_RESULTS,
        searchDisplayQuery: "",
        searchLoading: false,
      };
    default:
      return state;
  }
}

export const createInitialSearchState = (routeSearchQuery: string): SearchScreenState => ({
  query: routeSearchQuery,
  results: EMPTY_RESULTS,
  searchDisplayQuery: "",
  resultFilter: "all",
  searchLoading: false,
  isSearchMode: routeSearchQuery.length > 0,
  suggestions: [],
  suggestionsOpen: false,
});
