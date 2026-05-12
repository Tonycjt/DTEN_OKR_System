import { formatShortDate, formatWeekRange } from "../lib/week";
import { sendEmail, type EmailRecipient } from "./email";

type UserEmail = EmailRecipient & {
  id?: string;
};

function absoluteUrl(path: string) {
  const baseUrl = process.env.APP_BASE_URL ?? "http://localhost:3000";
  return new URL(path, baseUrl).toString();
}

export async function sendReviewRequestedEmail(input: {
  reviewer: UserEmail;
  reportOwner: UserEmail;
  weekStart: Date;
  weekEnd: Date;
}) {
  await sendEmail({
    to: input.reviewer,
    subject: `Review requested: ${input.reportOwner.name ?? input.reportOwner.email}`,
    relatedUrl: absoluteUrl("/reviews/pending"),
    text: [
      `${input.reportOwner.name ?? input.reportOwner.email} submitted a weekly report for ${formatWeekRange(input.weekStart, input.weekEnd)}.`,
      "",
      "Please review the report, note blockers, and approve or request follow-up.",
      absoluteUrl("/reviews/pending"),
    ].join("\n"),
  });
}

export async function sendFollowUpAssignedEmail(input: {
  assignee: UserEmail;
  assigner: UserEmail;
  content: string;
  dueDate?: Date | null;
  relatedPath: string;
}) {
  await sendEmail({
    to: input.assignee,
    subject: `Follow-up assigned by ${input.assigner.name ?? input.assigner.email}`,
    relatedUrl: absoluteUrl(input.relatedPath),
    text: [
      `${input.assigner.name ?? input.assigner.email} assigned you a follow-up:`,
      "",
      input.content,
      input.dueDate ? `Due: ${formatShortDate(input.dueDate)}` : null,
      "",
      absoluteUrl(input.relatedPath),
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function sendKrBlockedEmail(input: {
  owner: UserEmail;
  keyResultTitle: string;
  blocker?: string | null;
  relatedPath: string;
}) {
  await sendEmail({
    to: input.owner,
    subject: `KR blocked: ${input.keyResultTitle}`,
    relatedUrl: absoluteUrl(input.relatedPath),
    text: [
      `The KR "${input.keyResultTitle}" is now marked blocked/on hold.`,
      input.blocker ? `Blocker: ${input.blocker}` : null,
      "",
      "Please update the next step or add a follow-up so the risk stays visible.",
      absoluteUrl(input.relatedPath),
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

export async function sendWeeklyReportOverdueEmail(input: {
  user: UserEmail;
  weekStart: Date;
  weekEnd: Date;
  relatedPath: string;
}) {
  await sendEmail({
    to: input.user,
    subject: `Weekly report overdue: ${formatWeekRange(input.weekStart, input.weekEnd)}`,
    relatedUrl: absoluteUrl(input.relatedPath),
    text: [
      `Your weekly report for ${formatWeekRange(input.weekStart, input.weekEnd)} is overdue.`,
      "",
      "Please complete your weekly priorities, KR check-ins, blockers, and next steps.",
      absoluteUrl(input.relatedPath),
    ].join("\n"),
  });
}
