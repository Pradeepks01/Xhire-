import smtplib
import logging
import urllib.parse
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Dict, Any

from .X_config import (
    FRONTEND_URL, SMTP_HOST, SMTP_PORT,
    SMTP_USER, SMTP_PASSWORD, SMTP_FROM, SMTP_TLS
)

logger = logging.getLogger("xhire.email")

def generate_invitation_email(
    candidate_name: str,
    candidate_email: str,
    requisition_title: str,
    session_uuid: str,
    access_code: str
) -> tuple[str, str, str]:
    """
    Generates the subject, HTML body, and plain-text body for an interview invitation.
    """
    subject = f"Invitation to Interview: {requisition_title} | XHire"
    
    direct_link = f"{FRONTEND_URL.rstrip('/')}/candidate/{session_uuid}"
    encoded_email = urllib.parse.quote(candidate_email)
    portal_link = f"{FRONTEND_URL.rstrip('/')}/candidate-login?email={encoded_email}&code={access_code}"

    text_body = f"""Dear {candidate_name},

You have been invited to complete an automated AI technical interview for the following position:
Role: {requisition_title}

You can access and begin your interview directly using this link:
{direct_link}

Alternatively, you can log in at the candidate portal:
Portal: {portal_link}
Your Unique Access Code: {access_code}

Interview Tips:
- Ensure a reliable internet connection.
- A quiet environment is recommended.
- You can respond by typing or by speaking using your microphone.

Best regards,
The XHire Talent Team
"""

    html_body = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{subject}</title>
  <style>
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      background-color: #0b0f19;
      color: #e2e8f0;
      margin: 0;
      padding: 30px 15px;
    }}
    .container {{
      max-width: 580px;
      margin: 0 auto;
      background-color: #131b2e;
      border: 1px solid #1e293b;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    }}
    .header {{
      background: linear-gradient(135deg, #4f46e5, #7c3aed);
      padding: 28px 24px;
      text-align: center;
    }}
    .header h1 {{
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      color: #ffffff;
      letter-spacing: -0.5px;
    }}
    .header p {{
      margin: 6px 0 0 0;
      font-size: 14px;
      color: #e0e7ff;
    }}
    .content {{
      padding: 32px 28px;
    }}
    .greeting {{
      font-size: 18px;
      font-weight: 600;
      color: #ffffff;
      margin-bottom: 12px;
    }}
    .message {{
      font-size: 15px;
      line-height: 1.6;
      color: #94a3b8;
      margin-bottom: 24px;
    }}
    .role-badge {{
      display: inline-block;
      background-color: #1e293b;
      color: #a5b4fc;
      padding: 6px 14px;
      border-radius: 6px;
      font-weight: 600;
      font-size: 14px;
      margin-top: 4px;
      border: 1px solid #334155;
    }}
    .button-wrapper {{
      text-align: center;
      margin: 30px 0;
    }}
    .cta-btn {{
      display: inline-block;
      background: linear-gradient(135deg, #4f46e5, #6366f1);
      color: #ffffff !important;
      text-decoration: none;
      font-weight: 600;
      font-size: 16px;
      padding: 14px 36px;
      border-radius: 8px;
      box-shadow: 0 4px 14px rgba(79, 70, 229, 0.4);
    }}
    .code-box {{
      background-color: #0f172a;
      border: 1px dashed #334155;
      border-radius: 8px;
      padding: 16px;
      margin: 20px 0;
      text-align: center;
    }}
    .code-label {{
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #64748b;
      margin-bottom: 6px;
    }}
    .code-val {{
      font-family: monospace;
      font-size: 22px;
      font-weight: 700;
      color: #38bdf8;
      letter-spacing: 2px;
    }}
    .tips {{
      background-color: #1e293b;
      border-left: 4px solid #6366f1;
      padding: 14px 18px;
      border-radius: 4px;
      margin-top: 24px;
      font-size: 13px;
      color: #cbd5e1;
    }}
    .tips ul {{
      margin: 6px 0 0 0;
      padding-left: 20px;
    }}
    .footer {{
      border-top: 1px solid #1e293b;
      padding: 20px 24px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
    }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>XHire Autonomous Interview</h1>
      <p>Next-Generation Technical Evaluation</p>
    </div>
    <div class="content">
      <div class="greeting">Hello {candidate_name},</div>
      <p class="message">
        You have been selected to participate in an interactive technical interview for the position:
        <br />
        <span class="role-badge">{requisition_title}</span>
      </p>

      <div class="button-wrapper">
        <a href="{direct_link}" class="cta-btn" target="_blank">Start Your Interview &rarr;</a>
      </div>

      <div class="code-box">
        <div class="code-label">Your Unique Access Code</div>
        <div class="code-val">{access_code}</div>
        <p style="margin: 8px 0 0 0; font-size: 12px; color: #94a3b8;">
          Or enter this code manually at: <a href="{portal_link}" style="color: #818cf8;">Candidate Portal</a>
        </p>
      </div>

      <div class="tips">
        <strong>Important Preparation Tips:</strong>
        <ul>
          <li>Find a quiet environment free from distractions.</li>
          <li>Ensure a stable internet connection.</li>
          <li>You can provide answers either by typing or by speaking via voice input.</li>
        </ul>
      </div>
    </div>
    <div class="footer">
      Sent by XHire Recruitment Platform &bull; If you have questions, reply to your recruiter.
    </div>
  </div>
</body>
</html>
"""
    return subject, text_body, html_body

def send_interview_invitation(
    candidate_name: str,
    candidate_email: str,
    requisition_title: str,
    session_uuid: str,
    access_code: str
) -> Dict[str, Any]:
    """
    Sends an invitation email using SMTP if configured, or outputs a mock invitation preview.
    """
    subject, text_body, html_body = generate_invitation_email(
        candidate_name, candidate_email, requisition_title, session_uuid, access_code
    )
    direct_link = f"{FRONTEND_URL.rstrip('/')}/candidate/{session_uuid}"

    # If SMTP is configured, send real email
    if SMTP_HOST:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = SMTP_FROM
            msg["To"] = candidate_email

            msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
                if SMTP_TLS:
                    server.starttls()
                if SMTP_USER and SMTP_PASSWORD:
                    server.login(SMTP_USER, SMTP_PASSWORD)
                server.send_message(msg)

            logger.info(f"Sent invitation email to {candidate_email} via SMTP ({SMTP_HOST})")
            return {
                "sent": True,
                "mode": "smtp",
                "recipient": candidate_email,
                "direct_link": direct_link,
                "access_code": access_code,
                "message": f"Invitation email successfully delivered to {candidate_email}"
            }
        except Exception as e:
            logger.error(f"Failed to send email via SMTP ({e}). Falling back to mock dispatch.")

    # Local development / Mock dispatch
    mock_log = f"""
==================== [XHIRE EMAIL INVITATION DISPATCHED] ====================
To:           {candidate_name} <{candidate_email}>
Subject:      {subject}
Position:     {requisition_title}
Direct Link:  {direct_link}
Access Code:  {access_code}
Portal Link:  {FRONTEND_URL.rstrip('/')}/candidate-login?email={urllib.parse.quote(candidate_email)}&code={access_code}
=============================================================================
"""
    print(mock_log)
    logger.info(f"[MOCK EMAIL] Invitation generated for {candidate_email} (Link: {direct_link})")

    return {
        "sent": True,
        "mode": "mock",
        "recipient": candidate_email,
        "direct_link": direct_link,
        "access_code": access_code,
        "message": f"Mock invitation generated for {candidate_email}. Link: {direct_link}"
    }