import { TEMPLATE_CONTENT } from "@/lib/data/templates";
import { Section, SectionHeader } from "@/components/ui/Section";
import { TabSwitcher } from "@/components/ui/TabSwitcher";
import { CodeBlock } from "@/components/ui/CodeBlock";

export function CodeExamples() {
  const tabs = TEMPLATE_CONTENT.filter((t) => t.codeSnippet).map(
    (template) => ({
      label: template.title.replace(" Contract", "").replace(" Wallet", ""),
      content: <CodeBlock code={template.codeSnippet!} />,
    }),
  );

  return (
    <Section dark>
      <SectionHeader
        title="Explore the code"
        subtitle="Each template includes production-quality Soroban/Rust code with comprehensive test suites."
      />
      <div className="rounded-[var(--radius)] border border-border-subtle bg-slate-gray/20 p-4">
        <TabSwitcher tabs={tabs} />
      </div>
    </Section>
  );
}
