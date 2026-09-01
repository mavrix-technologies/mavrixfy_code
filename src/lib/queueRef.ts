import { createRef } from "react";

export interface QueueBottomSheetRef {
  expand: () => void;
  collapse: () => void;
  close: () => void;
  snapToIndex?: (index: number) => void;
}

export const globalQueueSheetRef = createRef<QueueBottomSheetRef>();
