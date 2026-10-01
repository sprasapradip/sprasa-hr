import { Globe, Phone } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { CONTACT_PHONE, CONTACT_TEL } from '@/layouts/PublicLayout';
import { EnquiryForm } from './EnquiryForm';

export default function ContactPage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Helmet>
        <title>Contact | Sprasa HR</title>
        <meta name="description" content="Questions about Sprasa HR? Call Sprasa Technical Solution or send us a message." />
      </Helmet>
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-fg">Ask a question</h1>
        <p className="mt-3 text-muted">Pricing, features, whether it fits a school or a consultancy: ask anything. We reply within one working day.</p>
        <ul className="mt-8 space-y-3 text-sm">
          <li>
            <a href={`tel:${CONTACT_TEL}`} className="flex items-center gap-3 text-fg hover:underline">
              <Phone className="size-4 text-primary" aria-hidden /> <span className="num">{CONTACT_PHONE}</span>
            </a>
          </li>
          <li>
            <a href="https://sprasatechnicalsolution.com.np/" target="_blank" rel="noreferrer" className="flex items-center gap-3 text-fg hover:underline">
              <Globe className="size-4 text-primary" aria-hidden /> sprasatechnicalsolution.com.np
            </a>
          </li>
        </ul>
      </div>
      <EnquiryForm type="CONTACT" />
    </div>
  );
}
