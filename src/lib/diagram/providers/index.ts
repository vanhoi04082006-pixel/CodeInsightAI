// Diagram Providers — barrel export + factory

import type { DiagramProvider, DiagramType } from "../types";
import { umlProvider } from "./uml";
import { sequenceProvider } from "./sequence";
import { erdProvider } from "./erd";
import { architectureProvider } from "./architecture";
import { moduleProvider } from "./module";
import { componentProvider } from "./component";

const PROVIDERS: Record<DiagramType, DiagramProvider> = {
  uml: umlProvider,
  sequence: sequenceProvider,
  erd: erdProvider,
  architecture: architectureProvider,
  module: moduleProvider,
  component: componentProvider,
};

export function getProvider(type: DiagramType | null): DiagramProvider | null {
  if (!type) return null;
  return PROVIDERS[type] || null;
}

export { umlProvider, sequenceProvider, erdProvider, architectureProvider, moduleProvider, componentProvider };
