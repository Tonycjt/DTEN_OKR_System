export type EmailRecipient = {
  email: string;
  name?: string | null;
};

export type EmailMessage = {
  to: EmailRecipient;
  subject: string;
  text: string;
  relatedUrl?: string;
};

type EmailProvider = {
  send(message: EmailMessage): Promise<void>;
};

function formatRecipient(recipient: EmailRecipient) {
  return recipient.name ? `${recipient.name} <${recipient.email}>` : recipient.email;
}

class DevLogEmailProvider implements EmailProvider {
  async send(message: EmailMessage) {
    const from = process.env.EMAIL_FROM ?? "DTEN OKR System <no-reply@dten.local>";

    console.info(
      [
        "[email:dev-log]",
        `From: ${from}`,
        `To: ${formatRecipient(message.to)}`,
        `Subject: ${message.subject}`,
        message.relatedUrl ? `Related URL: ${message.relatedUrl}` : null,
        "",
        message.text,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

class DisabledEmailProvider implements EmailProvider {
  async send() {
    return;
  }
}

function getEmailProvider(): EmailProvider {
  const provider = process.env.EMAIL_PROVIDER ?? "dev-log";

  if (provider === "disabled") {
    return new DisabledEmailProvider();
  }

  if (provider === "dev-log") {
    return new DevLogEmailProvider();
  }

  throw new Error(`Unsupported EMAIL_PROVIDER "${provider}". Use "dev-log" or "disabled".`);
}

export async function sendEmail(message: EmailMessage) {
  try {
    const provider = getEmailProvider();
    await provider.send(message);
  } catch (error) {
    console.error("[email:error]", error);
  }
}
