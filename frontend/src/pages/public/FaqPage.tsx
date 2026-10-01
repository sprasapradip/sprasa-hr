import { ArrowRight, ChevronDown } from 'lucide-react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

const TITLE = 'Frequently asked questions | Sprasa HR';
const DESCRIPTION = 'Fiscal year, tax slabs, SSF and PF, employee self-service and data hosting — answers to the questions we get asked most about Sprasa HR.';

const faqs = [
  ['Does it follow the Nepali fiscal year?', 'Yes. The fiscal year and its start date are settings, so a year that starts in Shrawan works fine. Payroll tax rules carry effective dates, so a change in the budget does not rewrite last year’s figures.'],
  ['Are the tax rates built in?', 'Tax slabs are configuration, not code. We include sample slabs for individuals and couples, and your accountant should confirm them before your first official payroll. When rates change, you add new slabs with a start date.'],
  ['Can we use SSF, PF and CIT?', 'Yes. Each is a salary component with its own rate, and contributions reduce taxable income up to the cap you configure.'],
  ['Can employees see their own payslips and leave?', 'Yes. Every employee can sign in to see their attendance, apply for leave, check balances and download payslips. They cannot see anyone else’s records.'],
  ['We only have 15 staff. Is this overkill?', 'No. Small offices use it too. You can start with employee records, attendance and leave, and turn on payroll when you are ready.'],
  ['Is it available in Nepali?', 'The interface is in English today. The main navigation already has a Nepali translation, and full Nepali plus Bikram Sambat dates are on the roadmap.'],
  ['Where is our data kept?', 'We can host it for you or install it on your own server. Uploaded documents are never public links: every download checks who is asking.'],
];

export default function FaqPage() {
  const faqLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
  };

  return (
    <>
      <Helmet>
        <title>{TITLE}</title>
        <meta name="description" content={DESCRIPTION} />
        <link rel="canonical" href="https://sprasatechnicalsolution.com.np/sprasa-hr/faq" />
        <script type="application/ld+json">{JSON.stringify(faqLd)}</script>
      </Helmet>

      <section className="border-b border-border bg-bg">
        <div className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <p className="text-sm font-medium text-primary">FAQ</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-fg sm:text-3xl">Questions we get asked</h1>
          <div className="mt-8 divide-y divide-border rounded-lg border border-border bg-surface">
            {faqs.map(([q, a]) => (
              <details key={q} className="group px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium text-fg">
                  {q}
                  <ChevronDown className="size-4 shrink-0 text-subtle transition-transform group-open:rotate-180" aria-hidden />
                </summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section>
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <div className="flex flex-col items-start justify-between gap-6 rounded-xl bg-brand-800 px-6 py-8 text-white sm:px-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-xl font-semibold">Still have a question?</h2>
              <p className="mt-1.5 max-w-xl text-brand-100">Tell us what you need and we will come back with a written recommendation and a realistic cost.</p>
            </div>
            <Button size="lg" className="bg-white text-brand-800 hover:bg-brand-50" asChild>
              <Link to="/contact">
                Ask a question <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
