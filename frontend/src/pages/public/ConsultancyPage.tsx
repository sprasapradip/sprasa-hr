import { Phone } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { CONTACT_PHONE, CONTACT_TEL } from '@/layouts/PublicLayout';
import { EnquiryForm } from './EnquiryForm';

export default function ConsultancyPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Helmet>
        <title>Request a consultation | Sprasa HR</title>
        <meta name="description" content="Tell us how your organisation handles HR and payroll. We will reply with a written recommendation and a realistic cost for Sprasa HR." />
      </Helmet>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Request a consultation</h1>
        <p className="mt-3 text-muted">Tell us what you need and we will come back with a written recommendation and a realistic cost.</p>
        <div className="mt-8 space-y-4 text-sm text-muted">
          <p className="font-medium text-fg">What happens next</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>We read your message and call you within one working day.</li>
            <li>A 30-minute conversation about your staff, leave rules and how salaries are paid now.</li>
            <li>You get a written proposal with scope, timeline and price. No obligation.</li>
          </ol>
        </div>
        <a href={`tel:${CONTACT_TEL}`} className="mt-8 inline-flex items-center gap-2 rounded-lg border border-border px-4 py-3 text-sm hover:bg-surface-2">
          <Phone className="size-4 text-primary" aria-hidden />
          <span>
            Prefer to talk? <span className="num font-medium text-fg">{CONTACT_PHONE}</span>
          </span>
        </a>
      </div>
      <EnquiryForm type="CONSULTATION" />
    </div>
  );
}
