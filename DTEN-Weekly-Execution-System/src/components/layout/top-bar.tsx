import { Search, UserRound } from "lucide-react";
import { LinkButton } from "@/components/ui/button";

export function TopBar() {
  return (
    <header className="top-bar">
      <div className="search-shell">
        <Search size={18} aria-hidden="true" />
        <span>Search objectives, KRs, reports</span>
      </div>
      <div className="top-bar-actions">
        <LinkButton href="/login" tone="ghost">
          <UserRound size={16} aria-hidden="true" />
          Demo Login
        </LinkButton>
      </div>
    </header>
  );
}
