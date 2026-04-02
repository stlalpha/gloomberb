import { colors } from "../../../theme/colors";

export function PredictionMarketRulesView({ rules }: { rules: string[] }) {
  return (
    <box flexDirection="column" gap={1}>
      {rules.map((rule, index) => (
        <box key={`${index}:${rule.slice(0, 24)}`} flexDirection="column">
          <text fg={colors.text}>{rule}</text>
        </box>
      ))}
      {rules.length === 0 && (
        <text fg={colors.textDim}>No rule text returned by the venue.</text>
      )}
    </box>
  );
}
