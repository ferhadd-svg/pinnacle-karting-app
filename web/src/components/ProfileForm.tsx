import { useState, type FormEvent } from 'react';
import { useStore, type Profile } from '../store';

export function ProfileForm({ onSaved, submitLabel = 'Save' }: { onSaved?: () => void; submitLabel?: string }) {
  const { profile, saveProfile } = useStore();
  const [form, setForm] = useState<Profile>(profile ?? { name: '', email: '', phone: '', birthYear: '' });
  const set = (k: keyof Profile) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    saveProfile({ ...form, name: form.name.trim(), email: form.email.trim() });
    onSaved?.();
  };

  return (
    <form className="form" onSubmit={submit}>
      <label>
        Driver name
        <input required value={form.name} onChange={set('name')} placeholder="e.g. Alex Morgan" autoComplete="name" />
      </label>
      <label>
        Email
        <input required type="email" value={form.email} onChange={set('email')} autoComplete="email" />
      </label>
      <div className="form-row">
        <label>
          Phone
          <input type="tel" value={form.phone} onChange={set('phone')} autoComplete="tel" />
        </label>
        <label>
          Birth year
          <input
            required
            inputMode="numeric"
            pattern="(19|20)[0-9]{2}"
            value={form.birthYear}
            onChange={set('birthYear')}
            placeholder="YYYY"
          />
        </label>
      </div>
      <button className="btn btn-primary" type="submit">
        {submitLabel}
      </button>
    </form>
  );
}
