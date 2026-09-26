interface StepperInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Minimum allowed value; decrement stops here and blur resets here. Defaults to 1. */
  min?: number;
  /** Parse and step as whole numbers. Defaults to false (decimals allowed). */
  integer?: boolean;
  testId?: string;
  ariaLabel?: string;
}

const sideButtonStyle: React.CSSProperties = {
  width: 36,
  height: 40,
  border: '1px solid #ccc',
  background: '#f5f5f5',
  cursor: 'pointer',
  fontSize: 18,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

/** Free-text numeric input with −/+ stepper buttons. */
export function StepperInput({ value, onChange, min = 1, integer = false, testId, ariaLabel }: StepperInputProps) {
  function parse(raw: string): number {
    return integer ? parseInt(raw, 10) : parseFloat(raw);
  }

  function decrement() {
    const current = parse(value);
    const base = isNaN(current) ? min : current;
    if (base > min) onChange(String(Math.round((base - 1) * 1000) / 1000));
  }

  function increment() {
    const current = parse(value);
    const base = isNaN(current) ? 0 : current;
    onChange(String(Math.round((base + 1) * 1000) / 1000));
  }

  function handleBlur() {
    const current = parse(value);
    if (isNaN(current) || current < min) onChange(String(min));
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <button
        type="button"
        onClick={decrement}
        aria-label={ariaLabel ? `הפחת ${ariaLabel}` : 'הפחת'}
        style={{ ...sideButtonStyle, borderRadius: '8px 0 0 8px' }}
      >
        −
      </button>
      <input
        type="text"
        inputMode={integer ? 'numeric' : 'decimal'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        data-testid={testId}
        aria-label={ariaLabel}
        style={{
          width: 56,
          height: 40,
          border: '1px solid #ccc',
          borderLeft: 'none',
          borderRight: 'none',
          textAlign: 'center',
          fontSize: 16,
          padding: 0,
          boxSizing: 'border-box',
        }}
      />
      <button
        type="button"
        onClick={increment}
        aria-label={ariaLabel ? `הגבר ${ariaLabel}` : 'הגבר'}
        style={{ ...sideButtonStyle, borderRadius: '0 8px 8px 0' }}
      >
        +
      </button>
    </div>
  );
}
