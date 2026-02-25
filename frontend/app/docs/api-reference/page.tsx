import { apiSections } from "../data";
import CodeBlock from "../components/CodeBlock";

export default function ApiReferencePage() {
  return (
    <div className="animate-fade-in">
      <h1 className="text-3xl font-bold tracking-tight mb-4">API Reference</h1>
      <p className="text-lg text-muted-fg mb-8 max-w-2xl">
        Complete reference for all Stellar Suite commands, their parameters, return types,
        and usage examples.
      </p>

      <div className="mb-8 p-4 rounded-lg bg-muted border border-border">
        <p className="text-sm font-medium mb-2">On this page</p>
        <ul className="flex flex-wrap gap-2">
          {apiSections.map((section) => (
            <li key={section.slug}>
              <a
                href={`#${section.slug}`}
                className="inline-block px-3 py-1.5 text-xs font-medium rounded-md bg-background border border-border text-muted-fg hover:text-accent hover:border-accent/50 transition-colors"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {apiSections.map((section) => (
        <section key={section.slug} className="mb-16">
          <h2 id={section.slug} className="text-2xl font-semibold mb-2">
            {section.title}
          </h2>
          <p className="text-muted-fg mb-6">{section.description}</p>

          {section.methods.map((method) => (
            <div
              key={method.name}
              className="mb-8 p-6 rounded-xl border border-border hover:border-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <h3 className="text-lg font-semibold font-mono text-accent">
                  {method.name}
                </h3>
              </div>
              <p className="text-sm text-muted-fg mb-4">{method.description}</p>

              <div className="mb-4">
                <p className="text-xs font-medium text-muted-fg uppercase tracking-wider mb-2">
                  Signature
                </p>
                <div className="px-4 py-2 rounded-lg bg-code-bg text-code-text text-sm font-mono overflow-x-auto">
                  {method.signature}
                </div>
              </div>

              {method.parameters.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-muted-fg uppercase tracking-wider mb-2">
                    Parameters
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left py-2 px-3 font-medium text-xs">Name</th>
                          <th className="text-left py-2 px-3 font-medium text-xs">Type</th>
                          <th className="text-left py-2 px-3 font-medium text-xs">Required</th>
                          <th className="text-left py-2 px-3 font-medium text-xs">Description</th>
                        </tr>
                      </thead>
                      <tbody>
                        {method.parameters.map((param) => (
                          <tr key={param.name} className="border-b border-border">
                            <td className="py-2 px-3 font-mono text-xs text-accent">{param.name}</td>
                            <td className="py-2 px-3 font-mono text-xs">{param.type}</td>
                            <td className="py-2 px-3 text-xs">
                              {param.required ? (
                                <span className="text-error font-medium">Yes</span>
                              ) : (
                                <span className="text-muted-fg">No</span>
                              )}
                            </td>
                            <td className="py-2 px-3 text-xs text-muted-fg">{param.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <p className="text-xs font-medium text-muted-fg uppercase tracking-wider mb-2">
                  Returns
                </p>
                <div className="px-4 py-2 rounded-lg bg-muted text-sm font-mono">
                  {method.returnType}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-muted-fg uppercase tracking-wider mb-2">
                  Example
                </p>
                <CodeBlock code={method.example} language="typescript" />
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
