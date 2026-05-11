import { LogIn } from "lucide-react";
import { redirect } from "next/navigation";
import { loginAction } from "@/app/login/actions";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/server/auth";

type LoginPageProps = {
  searchParams?: Promise<{
    error?: string;
  }>;
};

const errorMessage: Record<string, string> = {
  invalid: "Email or password is incorrect.",
  missing: "Email and password are required.",
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  const params = searchParams ? await searchParams : {};
  const error = params.error ? errorMessage[params.error] : null;

  return (
    <div className="stack">
      <PageHeader title="Demo Login" description="Use a seeded Release 1 user to enter the local MVP." />
      <Card>
        <CardHeader>
          <h2>Seeded User Access</h2>
          <p>Try ceo@dten.com, head@dten.com, manager@dten.com, engineer@dten.com, or sales@dten.com.</p>
        </CardHeader>
        <CardContent>
          <form action={loginAction} className="form-shell">
            {error ? <div className="alert">{error}</div> : null}
            <label className="field">
              <span>Email</span>
              <input autoComplete="email" defaultValue="ceo@dten.com" name="email" placeholder="ceo@dten.com" type="email" />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                autoComplete="current-password"
                defaultValue="Password123!"
                name="password"
                placeholder="Password123!"
                type="password"
              />
            </label>
            <button className="button button-primary" type="submit">
              <LogIn size={16} aria-hidden="true" />
              Sign In
            </button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
