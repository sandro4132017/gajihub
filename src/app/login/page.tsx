import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-extrabold tracking-tight text-ink">Gajihub - Login approver</h1>
      <p className="mt-1 text-sm text-muted">
        Login sementara khusus untuk pemberi approval berjenjang. Belum
        terhubung ke SIAP.
      </p>
      <div className="card mt-6 p-6">
        <LoginForm />
      </div>
    </main>
  );
}
