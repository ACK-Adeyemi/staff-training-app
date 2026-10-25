import { focusClasses } from './Button';
import { Icon } from './Icon';

export interface ChoiceOption {
  id: string;
  label: string;
}

export interface ChoiceListProps {
  name: string;
  legend: string;
  type: 'single' | 'multiple';
  options: ChoiceOption[];
  value: string[];
  onChange: (value: string[]) => void;
  /** When set the list is read only and shows right and wrong marks. */
  result?: { correctIds: string[] } | undefined;
  stateLabels: { correct: string; incorrect: string; selected?: string };
  /** Announce a single-choice list as a radio group (for questions) instead of a plain group. */
  radioGroup?: boolean;
}

export function ChoiceList({
  name,
  legend,
  type,
  options,
  value,
  onChange,
  result,
  stateLabels,
  radioGroup = false,
}: ChoiceListProps) {
  const locked = result !== undefined;
  return (
    <fieldset
      role={radioGroup && type === 'single' ? 'radiogroup' : undefined}
      className="flex flex-col gap-2 border-0 p-0"
    >
      <legend className="mb-2 text-lg font-semibold">{legend}</legend>
      {options.map((o) => {
        const selected = value.includes(o.id);
        const isCorrect = result?.correctIds.includes(o.id) ?? false;
        const mark = !locked ? null : isCorrect ? 'correct' : selected ? 'incorrect' : null;
        return (
          <label
            key={o.id}
            className={[
              'flex min-h-[var(--target-min)] items-center gap-3 rounded-[var(--radius-md)] border-2 px-3 py-2',
              locked ? 'cursor-default' : 'cursor-pointer',
              selected ? 'border-[var(--color-accent)] bg-[var(--color-surface)]' : 'border-[var(--color-border)]',
              'has-[:focus-visible]:outline-[length:3px] has-[:focus-visible]:outline-solid has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--color-focus)]',
            ].join(' ')}
          >
            <input
              type={type === 'single' ? 'radio' : 'checkbox'}
              name={name}
              value={o.id}
              checked={selected}
              disabled={locked}
              onChange={() => {
                if (locked) return;
                if (type === 'single') onChange([o.id]);
                else onChange(selected ? value.filter((v) => v !== o.id) : [...value, o.id]);
              }}
              className={['h-5 w-5 shrink-0 accent-[var(--color-accent)]', focusClasses].join(' ')}
            />
            <span className="flex-1">{o.label}</span>
            {mark ? (
              <span
                className={[
                  'inline-flex items-center gap-1 font-semibold',
                  mark === 'correct' ? 'text-[var(--status-current)]' : 'text-[var(--status-overdue)]',
                ].join(' ')}
              >
                <Icon name={mark === 'correct' ? 'check' : 'x-circle'} />
                {mark === 'correct' ? stateLabels.correct : stateLabels.incorrect}
              </span>
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}
