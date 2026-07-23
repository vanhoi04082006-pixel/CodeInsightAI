export const metadata = { title: "Terms of Service — CodeInsight AI" };

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <h1 className="text-3xl font-bold">Terms of Service</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: July 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Acceptance of Terms</h2>
          <p className="mt-2">By accessing CodeInsight AI, you agree to these Terms of Service. If you do not agree, please do not use the service.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. Service Description</h2>
          <p className="mt-2">CodeInsight AI is an AI-powered code analysis platform that analyzes GitHub repositories, generates reports, and provides AI-assisted chat. The service is provided "as is" without warranties.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. User Accounts</h2>
          <p className="mt-2">You must sign in with GitHub to use the service. You are responsible for maintaining the security of your account and all activities under your account.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. API Keys & BYOK</h2>
          <p className="mt-2">When using Bring Your Own Key (BYOK) mode, your API keys are encrypted with AES-256-GCM and stored server-side. We never expose raw API keys to the frontend. You are responsible for any usage costs incurred by your API keys.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Acceptable Use</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>Do not abuse, overload, or reverse-engineer the service</li>
            <li>Do not analyze repositories you do not have permission to access</li>
            <li>Do not use the service for illegal activities</li>
            <li>Respect rate limits and quota restrictions</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Subscriptions & Billing</h2>
          <p className="mt-2">Pro plan ($9/month) and Team plan ($29/month) are billed via Stripe. You can cancel anytime. Refunds are handled on a case-by-case basis. Free plan (BYOK) has no billing.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Limitation of Liability</h2>
          <p className="mt-2">CodeInsight AI is not liable for any damages arising from the use of the service, including but not limited to code analysis inaccuracies, AI-generated recommendations, or data loss.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Changes to Terms</h2>
          <p className="mt-2">We may update these Terms at any time. Continued use of the service constitutes acceptance of the updated Terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">9. Contact</h2>
          <p className="mt-2">For questions about these Terms, open an issue at our <a href="https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues" className="text-cyan-300 hover:underline">GitHub repository</a>.</p>
        </section>
      </div>
    </div>
  );
}
