/**
 * One create form, one field. The submit-and-clear-only-on-success handling is the
 * part worth having once rather than three times.
 *
 * A form that needs several fields wants its own component, or this one made generic
 * over a field list again — not a second `value` prop bolted on.
 */

import React, { useState } from 'react';

export const CreateForm: React.FC<{
  title: string;
  label: string;
  placeholder: string;
  /** Resolves to whether it worked — false leaves the form filled in. */
  onSubmit: (value: string) => Promise<boolean>;
}> = ({ title, label, placeholder, onSubmit }) => {
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const complete = value.trim() !== '';

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete || submitting) return;
    setSubmitting(true);
    try {
      // Only on success: a duplicate name is a 409, and wiping the form would make
      // the user retype it.
      if (await onSubmit(value)) setValue('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>{title}</h3>
      <label>
        {label}
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="submit" disabled={!complete || submitting}>
        {submitting ? 'Registering…' : 'Register'}
      </button>
    </form>
  );
};
