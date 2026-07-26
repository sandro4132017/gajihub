import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Gajihub - Login</h1>
      <div className="card mt-6 p-6">
        <LoginForm />
      </div>
    </main>
  );
}
