import { useState, FormEvent } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Input } from './Input';

// Confirmation dialog that requires the current user's password before a
// destructive action. Mount it conditionally so it resets between uses.
export function PasswordConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete permanently',
  onConfirm,
  onCancel,
  loading = false,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: (password: string) => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  const [password, setPassword] = useState('');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (password) onConfirm(password);
  }

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" form="pw-confirm" type="submit" loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id="pw-confirm" onSubmit={submit} className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
        <Input
          label="Enter your password to confirm"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />
      </form>
    </Modal>
  );
}
