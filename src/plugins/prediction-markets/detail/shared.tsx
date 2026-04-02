import { colors } from "../../../theme/colors";

export function truncatePredictionText(
  value: string,
  maxLength: number,
): string {
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

export function SummaryLink({
  url,
  maxLength,
}: {
  url: string;
  maxLength: number;
}) {
  return (
    <box height={1}>
      <text fg={colors.textDim}>Venue: </text>
      <text fg={colors.text}>{truncatePredictionText(url, maxLength)}</text>
    </box>
  );
}
