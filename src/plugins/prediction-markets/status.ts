import { colors } from "../../theme/colors";
import type { PredictionTransportState } from "./types";

export function formatPredictionTransportBadge(
  transport: PredictionTransportState,
): {
  label: string;
  color: string;
} {
  switch (transport) {
    case "live":
      return { label: "Live WS", color: colors.positive };
    case "polling":
      return { label: "Polling", color: colors.text };
    case "stale":
      return { label: "Stale", color: colors.textDim };
    case "error":
      return { label: "Error", color: colors.negative };
    case "loading":
      return { label: "Loading", color: colors.text };
    default:
      return { label: "Idle", color: colors.textDim };
  }
}
