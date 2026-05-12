import "dotenv/config";

let disconnectPrisma: (() => Promise<void>) | null = null;

async function main() {
  const [{ processWeeklyReportOverdueEmails }, { prisma }] = await Promise.all([
    import("../server/weekly-report-overdue"),
    import("../server/prisma"),
  ]);

  disconnectPrisma = () => prisma.$disconnect();

  const result = await processWeeklyReportOverdueEmails();

  console.log(
    `Processed overdue weekly report emails for ${result.weekStart.toISOString()} through ${result.weekEnd.toISOString()}.`
  );
  console.log(`Emails triggered: ${result.emailedUsers.length}`);

  for (const email of result.emailedUsers) {
    console.log(`- ${email}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectPrisma?.();
  });
