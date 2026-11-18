import { useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { toast } from "sonner";
import MainLayout from "@/components/layout/MainLayout";
import { apiFetch } from "@/lib/api";
import { useUser } from "@/lib/UserContext";

// Each person's own settings. Saved on their account, so they follow them to any computer.

const THEMES = [
  { key: "light", label: "Light", icon: Sun, hint: "Dark text on light backgrounds" },
  { key: "dark", label: "Dark", icon: Moon, hint: "Light text on dark backgrounds, easier at night" },
  { key: "system", label: "Match my computer", icon: Monitor, hint: "Follows the Windows light or dark setting" },
];
const PANELS = [
  { key: "distinct", label: "Distinct", hint: "Documents warm sand, texts soft blue" },
  { key: "soft", label: "Soft", hint: "Documents light gray, texts white" },
  { key: "plain", label: "Plain", hint: "Both white" },
];
const SIZES = [
  { key: "normal", label: "Normal", sample: "text-sm" },
  { key: "large", label: "Larger", sample: "text-base" },
];

function Choice({ selected, onSelect, children, label }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onClick={onSelect}
      className={`relative flex flex-1 flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
        selected ? "border-primary bg-accent ring-1 ring-primary" : "border-border bg-card hover:border-primary/50"
      }`}
    >
      {selected && <Check className="absolute right-3 top-3 h-4 w-4 text-primary" aria-hidden />}
      {children}
    </button>
  );
}

export default function Settings() {
  const { user, updateUser } = useUser();
  const [saving, setSaving] = useState(false);
  const theme = user?.theme || "system";
  const textSize = user?.text_size || "normal";
  const panelColors = user?.panel_colors || "distinct";

  const save = async (change) => {
    setSaving(true);
    const previous = user;
    updateUser({ ...user, ...change }); // show it right away
    try {
      const res = await apiFetch("/me/appearance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(change),
      });
      if (!res.ok) throw new Error();
      updateUser(await res.json());
      toast.success("Saved");
    } catch {
      updateUser(previous);
      toast.error("That didn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout>
      <div className="max-w-3xl space-y-8 p-6">
        <div>
          <h1 className="text-[1.375rem] font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">How DSS Connect looks for you. Saved to your account, so it's the same on any computer.</p>
        </div>

        <section aria-labelledby="theme-heading" className="space-y-3">
          <h2 id="theme-heading" className="text-base font-semibold">Colors</h2>
          <div role="radiogroup" aria-labelledby="theme-heading" className="flex flex-col gap-3 sm:flex-row">
            {THEMES.map(({ key, label, icon: Icon, hint }) => (
              <Choice key={key} label={label} selected={theme === key} onSelect={() => !saving && theme !== key && save({ theme: key })}>
                <Icon className="h-5 w-5" aria-hidden />
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </Choice>
            ))}
          </div>
        </section>

        <section aria-labelledby="size-heading" className="space-y-3">
          <h2 id="size-heading" className="text-base font-semibold">Text size</h2>
          <div role="radiogroup" aria-labelledby="size-heading" className="flex flex-col gap-3 sm:flex-row sm:max-w-md">
            {SIZES.map(({ key, label, sample }) => (
              <Choice key={key} label={label} selected={textSize === key} onSelect={() => !saving && textSize !== key && save({ text_size: key })}>
                <span className="font-semibold">{label}</span>
                <span className={`${sample} text-muted-foreground`}>Aa Bb 123</span>
              </Choice>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">Larger makes all text in DSS Connect about one size bigger.</p>
        </section>

        <section aria-labelledby="panels-heading" className="space-y-3">
          <h2 id="panels-heading" className="text-base font-semibold">Panel colors</h2>
          <p className="text-xs text-muted-foreground">How a lead's documents and texts are told apart when they're side by side.</p>
          <div role="radiogroup" aria-labelledby="panels-heading" className="flex flex-col gap-3 sm:flex-row">
            {PANELS.map(({ key, label, hint }) => (
              <Choice key={key} label={label} selected={panelColors === key} onSelect={() => !saving && panelColors !== key && save({ panel_colors: key })}>
                {/* a small preview: documents on the left, texts on the right, in this choice's colors */}
                <span data-panel-colors={key} className="flex h-10 w-full overflow-hidden rounded border border-border" aria-hidden>
                  <span className="w-2/5 border-r border-border bg-[var(--docs-surface)]" />
                  <span className="flex-1 bg-[var(--texts-surface)]" />
                </span>
                <span className="font-semibold">{label}</span>
                <span className="text-xs text-muted-foreground">{hint}</span>
              </Choice>
            ))}
          </div>
        </section>

        <section aria-labelledby="about-heading" className="space-y-1 border-t border-border pt-6">
          <h2 id="about-heading" className="text-base font-semibold">About DSS Connect</h2>
          <p className="text-sm text-muted-foreground">Texting, documents and leads for Davis, Saperstein &amp; Salomon, connected to LawBase.</p>
          <p className="text-sm text-muted-foreground">Designed by Sebastian Kucik, IT Director, Davis, Saperstein &amp; Salomon, P.C.</p>
        </section>
      </div>
    </MainLayout>
  );
}
