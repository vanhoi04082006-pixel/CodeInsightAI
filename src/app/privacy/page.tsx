export const metadata = { title: "Privacy Policy — CodeInsight AI" };

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 md:px-6">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated: July 2026</p>

      <div className="mt-8 space-y-6 text-sm leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-lg font-semibold text-foreground">1. Data We Collect</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>GitHub profile:</strong> name, email, avatar (via OAuth)</li>
            <li><strong>Repository data:</strong> public/private repo contents fetched via GitHub API for analysis</li>
            <li><strong>Analysis results:</strong> stored in our database (PostgreSQL on Neon)</li>
            <li><strong>API keys (BYOK):</strong> encrypted with AES-256-GCM, never exposed to frontend</li>
            <li><strong>Usage data:</strong> number of analyses, chat messages, agent tasks per month</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">2. How We Use Data</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>To provide repository analysis and AI-powered insights</li>
            <li>To enforce plan quotas (free: 5 analyses/month, pro: 100/month)</li>
            <li>To improve the quality of our analysis engine</li>
            <li>To process Stripe payments for Pro/Team subscriptions</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">3. API Key Security</h2>
          <p className="mt-2">Your BYOK API keys are encrypted with AES-256-GCM using a key derived from NEXTAUTH_SECRET. Keys are decrypted only at request time (for AI calls) and never logged, cached, or exposed to the frontend. Masked keys (e.g., <code className="rounded bg-white/5 px-1 text-cyan-300">sk-1••••••21e5</code>) are shown in the UI for identification only.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">4. Third-Party Services</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>GitHub:</strong> OAuth authentication, repository fetching</li>
            <li><strong>Neon:</strong> PostgreSQL database hosting</li>
            <li><strong>Vercel:</strong> Application hosting</li>
            <li><strong>Stripe:</strong> Payment processing (Pro/Team plans)</li>
            <li><strong>AI Providers:</strong> OpenRouter, OpenAI, Anthropic, etc. (BYOK or Platform AI)</li>
          </ul>
          <p className="mt-2">Each third-party service has its own privacy policy. We only share data necessary for the service to function.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">5. Data Retention</h2>
          <p className="mt-2">Analysis results are stored indefinitely unless you delete them. You can delete all your data anytime via Settings → Danger Zone → Delete Account. Share links expire after 7 days.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">6. Your Rights</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Access:</strong> View your data in the app (Dashboard, History, Settings)</li>
            <li><strong>Deletion:</strong> Delete all your data via Settings → Delete Account</li>
            <li><strong>Export:</strong> Download analysis reports as Markdown/JSON</li>
            <li><strong>Revoke:</strong> Revoke GitHub OAuth access at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">7. Cookies</h2>
          <p className="mt-2">We use a JWT session cookie (httpOnly) for authentication and a language preference cookie. No tracking cookies or analytics scripts are used.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-foreground">8. Contact</h2>
          <p className="mt-2">For privacy questions, open an issue at our <a href="https://github.com/vanhoi04082006-pixel/CodeInsightAI/issues" className="text-cyan-300 hover:underline">GitHub repository</a>.</p>
        </section>
      </div>
    </div>
  );
}
