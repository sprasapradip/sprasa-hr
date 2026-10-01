/**
 * Reusable email templates. Every value interpolated into HTML goes through esc().
 * Each template returns subject, HTML and a plain-text alternative.
 */

export interface EmailContent {
  subject: string;
  html: string;
  text: string;
}

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function layout(orgName: string, heading: string, bodyHtml: string, action?: { label: string; url: string }) {
  const button = action
    ? `<p style="margin:24px 0"><a href="${esc(action.url)}" style="background:#0F766E;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${esc(action.label)}</a></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:10px;border:1px solid #e2e8f0">
<tr><td style="padding:20px 28px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0F766E">${esc(orgName)} · Sprasa HR</td></tr>
<tr><td style="padding:28px"><h1 style="font-size:20px;margin:0 0 16px">${esc(heading)}</h1>${bodyHtml}${button}</td></tr>
<tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">You received this because you have an account on Sprasa HR. Please don't reply to this automated message.</td></tr>
</table></td></tr></table></body></html>`;
}

const p = (text: string) => `<p style="margin:0 0 12px;line-height:1.6">${text}</p>`;

export const templates = {
  welcome(o: { orgName: string; name: string; email: string; loginUrl: string; setPasswordUrl?: string }): EmailContent {
    const setPw = o.setPasswordUrl;
    return {
      subject: `Your Sprasa HR account at ${o.orgName}`,
      html: layout(
        o.orgName,
        `Welcome, ${o.name}`,
        p(`An account has been created for you on ${esc(o.orgName)}'s HR system. You can sign in with <strong>${esc(o.email)}</strong>.`) +
          p(setPw ? 'Use the button below to set your password. The link expires in 24 hours.' : 'Ask your HR team for your temporary password, then change it after you sign in.'),
        setPw ? { label: 'Set your password', url: setPw } : { label: 'Sign in', url: o.loginUrl },
      ),
      text: `Welcome, ${o.name}. Your Sprasa HR account at ${o.orgName} uses ${o.email}. ${setPw ? `Set your password: ${setPw}` : `Sign in: ${o.loginUrl}`}`,
    };
  },

  passwordReset(o: { orgName: string; name: string; resetUrl: string }): EmailContent {
    return {
      subject: 'Reset your Sprasa HR password',
      html: layout(
        o.orgName,
        'Password reset',
        p(`Hi ${esc(o.name)}, we received a request to reset your password.`) +
          p('The link below works once and expires in 1 hour. If you did not ask for this, you can ignore this email and your password will stay the same.'),
        { label: 'Reset password', url: o.resetUrl },
      ),
      text: `Hi ${o.name}, reset your password within 1 hour: ${o.resetUrl}. If you didn't ask for this, ignore this email.`,
    };
  },

  emailVerification(o: { orgName: string; name: string; verifyUrl: string }): EmailContent {
    return {
      subject: 'Confirm your email address',
      html: layout(o.orgName, 'Confirm your email', p(`Hi ${esc(o.name)}, please confirm this is your email address.`), {
        label: 'Confirm email',
        url: o.verifyUrl,
      }),
      text: `Hi ${o.name}, confirm your email: ${o.verifyUrl}`,
    };
  },

  leaveSubmitted(o: { orgName: string; approverName: string; employeeName: string; leaveType: string; dates: string; days: string; url: string }): EmailContent {
    return {
      subject: `Leave request from ${o.employeeName}`,
      html: layout(
        o.orgName,
        'New leave request',
        p(`Hi ${esc(o.approverName)}, ${esc(o.employeeName)} has asked for ${esc(o.days)} day(s) of ${esc(o.leaveType)} (${esc(o.dates)}).`),
        { label: 'Review request', url: o.url },
      ),
      text: `${o.employeeName} requested ${o.days} day(s) of ${o.leaveType} (${o.dates}). Review: ${o.url}`,
    };
  },

  leaveApproved(o: { orgName: string; name: string; leaveType: string; dates: string; url: string }): EmailContent {
    return {
      subject: 'Your leave request was approved',
      html: layout(o.orgName, 'Leave approved', p(`Hi ${esc(o.name)}, your ${esc(o.leaveType)} for ${esc(o.dates)} has been approved.`), {
        label: 'View leave',
        url: o.url,
      }),
      text: `Hi ${o.name}, your ${o.leaveType} for ${o.dates} was approved.`,
    };
  },

  leaveRejected(o: { orgName: string; name: string; leaveType: string; dates: string; reason: string; url: string }): EmailContent {
    return {
      subject: 'Your leave request was not approved',
      html: layout(
        o.orgName,
        'Leave not approved',
        p(`Hi ${esc(o.name)}, your ${esc(o.leaveType)} for ${esc(o.dates)} was not approved.`) + p(`Reason: ${esc(o.reason)}`),
        { label: 'View leave', url: o.url },
      ),
      text: `Hi ${o.name}, your ${o.leaveType} for ${o.dates} was not approved. Reason: ${o.reason}`,
    };
  },

  payslipAvailable(o: { orgName: string; name: string; period: string; url: string }): EmailContent {
    return {
      subject: `Your payslip for ${o.period}`,
      html: layout(o.orgName, 'Payslip ready', p(`Hi ${esc(o.name)}, your payslip for ${esc(o.period)} is ready in Sprasa HR.`), {
        label: 'View payslip',
        url: o.url,
      }),
      text: `Hi ${o.name}, your payslip for ${o.period} is ready: ${o.url}`,
    };
  },

  documentExpiry(o: { orgName: string; name: string; items: { employee: string; title: string; expiry: string }[]; url: string }): EmailContent {
    const rows = o.items
      .map((i) => `<tr><td style="padding:4px 8px">${esc(i.employee)}</td><td style="padding:4px 8px">${esc(i.title)}</td><td style="padding:4px 8px">${esc(i.expiry)}</td></tr>`)
      .join('');
    return {
      subject: `${o.items.length} employee document(s) expiring soon`,
      html: layout(
        o.orgName,
        'Documents expiring soon',
        p(`Hi ${esc(o.name)}, these documents expire within the next 30 days:`) +
          `<table style="border-collapse:collapse;font-size:14px;margin-bottom:12px"><tr><th align="left" style="padding:4px 8px">Employee</th><th align="left" style="padding:4px 8px">Document</th><th align="left" style="padding:4px 8px">Expires</th></tr>${rows}</table>`,
        { label: 'Open documents', url: o.url },
      ),
      text: `Documents expiring soon:\n${o.items.map((i) => `- ${i.employee}: ${i.title} (${i.expiry})`).join('\n')}`,
    };
  },

  securityAlert(o: { orgName: string; name: string; message: string }): EmailContent {
    return {
      subject: 'Security notice for your Sprasa HR account',
      html: layout(o.orgName, 'Security notice', p(`Hi ${esc(o.name)}, ${esc(o.message)}`) + p('If this was not you, contact your HR administrator straight away.')),
      text: `Hi ${o.name}, ${o.message} If this was not you, contact your HR administrator.`,
    };
  },
};
