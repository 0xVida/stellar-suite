import { TEMPLATE_CONTENT } from "@/lib/data/templates";
import { Section, SectionHeader } from "@/components/ui/Section";
import { TemplateCard } from "./TemplateCard";

export function TemplateGallery() {
  return (
    <Section id="templates" dark>
      <SectionHeader
        title="Production-ready contract templates"
        subtitle="Start with battle-tested Soroban contract scaffolds. Each template includes full source, tests, and documentation."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEMPLATE_CONTENT.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </Section>
  );
}
