import { getCurrentUser } from "@/server/auth";
import { buildDashboardCsvRows, parseDashboardExportFilters, rowsToCsv } from "@/lib/dashboard-export";

export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(request.url);
  const filters = parseDashboardExportFilters(url.searchParams);
  const rows = await buildDashboardCsvRows(user, filters, url.origin);
  const csv = rowsToCsv(rows);
  const date = new Date().toISOString().slice(0, 10);

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dten-dashboard-export-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
