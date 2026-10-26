import { ProgressRing } from './ProgressRing';

export interface GoalRingProps {
  label: string;
  percent: number;
  valueText: string;
  description: string;
  completeLabel: string;
  size?: number;
}

export function GoalRing({ label, percent, valueText, description, completeLabel, size }: GoalRingProps) {
  return (
    <div className="inline-flex flex-col items-center gap-1">
      <span className="font-semibold">{label}</span>
      <div role="img" aria-label={description}>
        <ProgressRing
          percent={percent}
          valueText={valueText}
          description=""
          completeLabel={completeLabel}
          {...(size === undefined ? {} : { size })}
        />
      </div>
    </div>
  );
}
