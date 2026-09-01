import { createRef } from "react";

export interface AddSongsBottomSheetRef {
  expand: () => void;
  collapse: () => void;
  close: () => void;
}

export const globalAddSongsSheetRef = createRef<AddSongsBottomSheetRef>();
