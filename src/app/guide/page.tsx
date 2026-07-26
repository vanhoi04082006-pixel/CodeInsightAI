import { Metadata } from "next";
import GuideContent from "./guide-content";

export const metadata: Metadata = {
  title: "User Guide — CodeInsight AI",
  description: "Complete guide to using CodeInsight AI: analyze repos, AI chat, settings, and more.",
};

export default function GuidePage() {
  return <GuideContent />;
}
