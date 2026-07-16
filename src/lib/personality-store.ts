"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Personality, PersonalityId } from "./personalities";
import { BUILTIN_PERSONALITIES, PERSONALITY_BY_ID } from "./personalities";

interface PersonalityState {
  // custom personalities created by the user
  custom: Personality[];
  // the active personality id (builtin or custom)
  activeId: PersonalityId;
  // default personality id (used when starting a new chat)
  defaultId: PersonalityId;

  setActive: (id: PersonalityId) => void;
  setDefault: (id: PersonalityId) => void;
  addCustom: (p: Personality) => void;
  updateCustom: (id: string, patch: Partial<Personality>) => void;
  removeCustom: (id: string) => void;
  duplicateCustom: (id: string) => void;
  importPersonalities: (p: Personality[]) => number;
  exportPersonalities: () => Personality[];
  getActive: () => Personality;
  all: () => Personality[];
}

function newCustomId() {
  return `custom_${Math.random().toString(36).slice(2, 9)}`;
}

export const usePersonalityStore = create<PersonalityState>()(
  persist(
    (set, get) => ({
      custom: [],
      activeId: "cto",
      defaultId: "cto",

      setActive: (id) => set({ activeId: id }),
      setDefault: (id) => set({ defaultId: id, activeId: id }),

      addCustom: (p) =>
        set((s) => ({
          custom: [...s.custom, { ...p, id: p.id || newCustomId(), builtin: false }],
        })),

      updateCustom: (id, patch) =>
        set((s) => ({
          custom: s.custom.map((p) => (p.id === id ? { ...p, ...patch, builtin: false } : p)),
        })),

      removeCustom: (id) =>
        set((s) => {
          const next = s.custom.filter((p) => p.id !== id);
          const activeId = s.activeId === id ? s.defaultId : s.activeId;
          return { custom: next, activeId };
        }),

      duplicateCustom: (id) =>
        set((s) => {
          const src = s.custom.find((p) => p.id === id);
          if (!src) return s;
          const copy: Personality = {
            ...src,
            id: newCustomId(),
            name: `${src.name} (copy)`,
            builtin: false,
          };
          return { custom: [...s.custom, copy] };
        }),

      importPersonalities: (list) => {
        const valid = (list || []).filter(
          (p) => p && p.name && p.systemPrompt && !PERSONALITY_BY_ID[p.id]
        );
        set((s) => ({ custom: [...s.custom, ...valid.map((p) => ({ ...p, id: p.id || newCustomId(), builtin: false }))] }));
        return valid.length;
      },

      exportPersonalities: () => get().custom,

      getActive: () => {
        const { activeId, custom } = get();
        return PERSONALITY_BY_ID[activeId] ?? custom.find((p) => p.id === activeId) ?? PERSONALITY_BY_ID["cto"];
      },

      all: () => [...BUILTIN_PERSONALITIES, ...get().custom],
    }),
    {
      name: "codeinsight-ai-personalities",
    }
  )
);
