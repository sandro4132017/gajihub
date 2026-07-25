import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">Gajihub - Login approver</h1>
      <p className="mt-1 text-sm text-gray-500">
        Login sementara khusus untuk pemberi approval berjenjang. Belum
        terhubung ke SIAP.
      </p>
      <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <LoginForm />
      </div>
    </main>
  );
}
