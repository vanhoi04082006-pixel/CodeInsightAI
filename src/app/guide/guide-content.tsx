"use client";

import { useT } from "@/lib/i18n";

/** Ordered list of section keys (camelCase) — drives rendering & quick-nav. */
const SECTION_KEYS = [
  "gettingStarted",
  "analyze",
  "dashboard",
  "aiFeatures",
  "settings",
  "troubleshooting",
  "keyboardShortcuts",
  "faq",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

interface GuideSectionData {
  title: string;
  icon: string;
  content: string;
}

/**
 * Client component that renders the locale-aware User Guide.
 * Reads all strings from the `guide` namespace via useT().
 * The page.tsx server component keeps the static metadata export
 * and simply renders <GuideContent />.
 */
export default function GuideContent() {
  const { t } = useT();

  const pageTitle = t("guide", "pageTitle");
  const subtitle = t("guide", "subtitle");
  const backLink = t("guide", "backLink");

  // Split heading so the last word gets the gradient treatment,
  // matching the original visual design ("User <gradient>Guide</gradient>").
  const lastSpace = pageTitle.lastIndexOf(" ");
  const head = lastSpace > 0 ? pageTitle.slice(0, lastSpace) : "";
  const tail = lastSpace > 0 ? pageTitle.slice(lastSpace + 1) : pageTitle;

  const sections: { id: SectionKey; data: GuideSectionData }[] = SECTION_KEYS.map(
    (id) => ({
      id,
      data: {
        title: t("guide", `sections.${id}.title`),
        icon: t("guide", `sections.${id}.icon`),
        content: t("guide", `sections.${id}.content`),
      },
    }),
  );

  return (
    <div className="relative min-h-screen">
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-6">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold md:text-4xl">
            {head && <>{head} </>}
            <span className="text-gradient-aurora">{tail}</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
        </div>

        {/* Quick nav */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs transition hover:border-cyan-400/30 hover:bg-cyan-500/10 hover:text-cyan-300"
            >
              {s.data.icon} {s.data.title}
            </a>
          ))}
        </div>

        {/* Content */}
        <div className="space-y-12">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <div className="glass-card rounded-2xl p-6 md:p-8">
                <div className="prose prose-invert max-w-none">
                  <h2 className="flex items-center gap-2 text-xl font-bold md:text-2xl">
                    <span>{section.data.icon}</span>
                    {section.data.title}
                  </h2>
                  <div className="mt-4 space-y-3 text-sm leading-relaxed text-foreground/80">
                    {section.data.content.split("\n").map((line, i) => {
                      if (line.startsWith("## "))
                        return (
                          <h3
                            key={i}
                            className="mt-4 text-base font-semibold text-foreground"
                          >
                            {line.replace("## ", "")}
                          </h3>
                        );
                      if (line.startsWith("| "))
                        return (
                          <pre
                            key={i}
                            className="overflow-x-auto rounded-lg bg-black/30 p-2 text-xs"
                          >
                            {line}
                          </pre>
                        );
                      if (line.startsWith("- "))
                        return (
                          <p key={i} className="ml-4 text-xs">
                            • {line.replace("- ", "")}
                          </p>
                        );
                      if (line.trim() === "")
                        return <br key={i} />;
                      return (
                        <p key={i} className="text-xs">
                          {line}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>

        {/* Back to app */}
        <div className="mt-12 text-center">
          <a
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 px-6 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
          >
            {backLink}
          </a>
        </div>
      </div>
    </div>
  );
}
