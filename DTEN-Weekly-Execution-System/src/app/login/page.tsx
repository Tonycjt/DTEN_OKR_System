import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

export default function LoginPage() {
  return (
    <div className="stack">
      <PageHeader title="Demo Login" description="Local email and password auth will be wired in during the auth milestone." />
      <Card>
        <CardHeader>
          <h2>Seeded User Access</h2>
          <p>Release 1 allows local auth and seeded users for testing.</p>
        </CardHeader>
        <CardContent>
          <form className="form-shell">
            <label className="field">
              <span>Email</span>
              <input placeholder="ceo@dten.com" type="email" />
            </label>
            <label className="field">
              <span>Password</span>
              <input placeholder="••••••••" type="password" />
            </label>
            <Button type="button">
              <LogIn size={16} aria-hidden="true" />
              Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
