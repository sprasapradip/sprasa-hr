import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { prisma } from '../../lib/prisma';
import { body } from '../../middleware/validate';
import { sendEmail } from '../../services/email.service';
import { optional } from '../../utils/validation';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Public enquiry forms on /consultancy and /contact. No authentication; heavily rate limited. */
export const publicRoutes = Router();

const enquiryLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: env.isTest ? 1000 : 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many submissions. Please call us instead.', code: 'RATE_LIMITED' },
});

const enquirySchema = z.object({
  type: z.enum(['CONSULTATION', 'CONTACT']),
  name: z.string().trim().min(2, 'Enter your name').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  phone: optional(z.string().trim().max(30)),
  organisationName: optional(z.string().trim().max(150)),
  employeeCount: optional(z.enum(['1-10', '11-50', '51-200', '201-500', '500+'])),
  message: z.string().trim().min(10, 'Tell us a little more (at least 10 characters)').max(3000),
  /** Honeypot: real users never fill this hidden field. */
  website: z.string().max(0).optional().or(z.literal('')),
});

publicRoutes.post('/enquiries', enquiryLimiter, async (req, res) => {
  const input = body(req, enquirySchema);
  const { website: _hp, ...data } = input;
  const enquiry = await prisma.enquiry.create({ data: { ...data, ipAddress: req.ip ?? null } });
  const inbox = env.SMTP_USER || env.SMTP_FROM.match(/<(.+)>/)?.[1];
  if (inbox) {
    await sendEmail(inbox, {
      subject: `[Sprasa HR] New ${data.type.toLowerCase()} enquiry from ${data.name}`,
      text: `${data.name} <${data.email}> ${data.phone ?? ''}\nOrganisation: ${data.organisationName ?? '-'} (${data.employeeCount ?? '-'} employees)\n\n${data.message}`,
      html: `<p><strong>${esc(data.name)}</strong> &lt;${esc(data.email)}&gt; ${esc(data.phone ?? '')}</p><p>Organisation: ${esc(data.organisationName ?? '-')} (${esc(data.employeeCount ?? '-')} employees)</p><p>${esc(data.message).replace(/\n/g, '<br>')}</p>`,
    });
  }
  logger.info({ enquiryId: enquiry.id, type: data.type }, 'Enquiry received');
  res.status(201).json({ success: true, message: 'Thank you. We will get back to you within one working day.' });
});
