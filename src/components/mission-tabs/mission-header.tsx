"use client";

import { motion } from "framer-motion";
import { Rocket } from "lucide-react";
import { GradientText } from "@/components/shared/ui";
import { useT } from "@/lib/i18n";

export function MissionHeader() {
  const { t } = useT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Rocket className="h-4 w-4 text-cyan-300" />
          <span>{t("mission", "subtitle") || "AI Operating System"}</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">
          <GradientText>
            {t("mission", "title") || "Mission Control"}
          </GradientText>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("mission", "description") ||
            "Give your AI team a goal. They plan, execute, verify, and ship — autonomously."}
        </p>
      </div>
    </motion.div>
  );
}
