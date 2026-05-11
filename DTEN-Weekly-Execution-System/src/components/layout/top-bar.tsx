import { Search, UserRound } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { LinkButton } from "@/components/ui/button";
import type { getCurrentUser } from "@/server/auth";

type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>;

export function TopBar({ user }: { user: CurrentUser }) {
  return (
    <header className="top-bar">
      <div className="search-shell">
        <Search size={18} aria-hidden="true" />
        <span>Search objectives, KRs, reports</span>
      </div>
      <div className="top-bar-actions">
        {user ? (
          <>
            <div className="user-chip">
              <UserRound size={16} aria-hidden="true" />
              <span>{user.name}</span>
            </div>
            <form action={logoutAction}>
              <button className="button button-ghost" type="submit">
                Sign Out
              </button>
            </form>
          </>
        ) : (
          <LinkButton href="/login" tone="ghost">
            <UserRound size={16} aria-hidden="true" />
            Demo Login
          </LinkButton>
        )}
      </div>
    </header>
  );
}
