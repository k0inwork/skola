import nodemailer from "nodemailer";
import { config } from "./config.js";

const transporter = config.SMTP_HOST
  ? nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth: {
        user: config.SMTP_USER,
        pass: config.SMTP_PASS,
      },
    })
  : null;

export async function sendNewMessageEmail(
  to: string,
  senderName: string,
  content: string
): Promise<void> {
  if (!transporter) {
    console.warn("SMTP not configured, skipping email notification");
    return;
  }

  await transporter.sendMail({
    from: `"Skola" <${config.SMTP_USER}>`,
    to,
    subject: `Jauna ziņa no ${senderName}`,
    text: `${senderName} nosūtīja jums ziņu:\n\n${content}\n\nPieslēdzieties savā kontā, lai atbildētu: ${config.APP_URL}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="margin-bottom: 8px;">Jauna ziņa</h2>
        <p style="color: #666; margin-top: 0;"><strong>${senderName.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</strong> nosūtīja jums ziņu:</p>
        <div style="background: #f5f5f5; padding: 12px 16px; border-radius: 8px; margin: 16px 0;">
          ${content.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}
        </div>
        <a href="${config.APP_URL}/messages"
           style="display: inline-block; background: #2563eb; color: #fff; padding: 10px 20px;
                  border-radius: 6px; text-decoration: none; margin-top: 8px;">
          Atvērt ziņas
        </a>
      </div>
    `,
  });
}
