"use client";

import { useActionState } from "react";
import { loginAction, type LoginFormState } from "./actions";

const INITIAL_STATE: LoginFormState = {};

export function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, INITIAL_STATE);

  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="field-label">NIP</label>
        <input name="nip" required autoFocus className="field-input" />
      </div>
      <div>
        <label className="field-label">Password</label>
        <input name="password" type="password" required className="field-input" />
      </div>
      <button type="submit" disabled={pending} className="btn btn-primary w-full">
        {pending ? "Memproses..." : "Login"}
      </button>
      {state.error && <p className="text-sm font-medium text-red">{state.error}</p>}
    </form>
  );
}
