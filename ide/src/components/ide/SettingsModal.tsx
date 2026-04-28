import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useUserSettingsStore, Language } from "@/store/useUserSettingsStore";
import { Sun, Moon, Monitor, Type, Save, Globe, Variable, Languages, Zap, AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";
import { EnvVarManager } from "@/components/settings/EnvVarManager";
import { ResourceUsageDashboard } from "@/components/settings/ResourceUsageDashboard";
import { ThemeEditor } from "@/components/settings/ThemeEditor";
import { Diagnostics } from "@/components/settings/Diagnostics";
import { TerminalSettings } from "@/components/settings/TerminalSettings";
import { useTranslation } from "react-i18next";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { t } = useTranslation();
  const [isMounted, setIsMounted] = React.useState(false);
  React.useEffect(() => setIsMounted(true), []);

  const { 
    fontSize, 
    formatOnSave, 
    language, 
    experimentalLocalBuild,
    setFontSize, 
    setFormatOnSave, 
    setLanguage,
    setExperimentalLocalBuild,
  } = useUserSettingsStore();
  const { theme, setTheme } = useTheme();

  if (!isMounted) return null;

  const languages = [
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español' },
    { code: 'zh', name: '中文' },
    { code: 'pt', name: 'Português' },
    { code: 'ar', name: 'العربية (RTL)' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-background border-border shadow-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">{t('general.settings')}</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('general.settings_description', 'Customize your IDE experience. Changes are persisted automatically.')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full mt-4">
          <TabsList className="grid w-full grid-cols-6 bg-muted/50 p-1">
            <TabsTrigger value="general" className="data-[state=active]:bg-background">{t('general.general', 'General')}</TabsTrigger>
            <TabsTrigger value="editor" className="data-[state=active]:bg-background">{t('general.editor', 'Editor')}</TabsTrigger>
            <TabsTrigger value="usage" className="data-[state=active]:bg-background">{t('general.usage', 'Usage')}</TabsTrigger>
            <TabsTrigger value="diagnostics" className="data-[state=active]:bg-background">{t('general.diagnostics', 'Diagnostics')}</TabsTrigger>
            <TabsTrigger value="environment" className="data-[state=active]:bg-background">{t('general.environment', 'Environment')}</TabsTrigger>
            <TabsTrigger value="network" className="data-[state=active]:bg-background">{t('general.network', 'Network')}</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-6 py-6 animate-in fade-in-50 duration-300">
            <div className="space-y-4">
              <Label className="text-base font-semibold">{t('general.appearance')}</Label>
              <div className="grid grid-cols-3 gap-4">
                {(["light", "dark", "system"] as const).map((tValue) => (
                  <button
                    key={tValue}
                    onClick={() => setTheme(tValue)}
                    className={`flex flex-col items-center gap-3 p-4 rounded-xl border-2 transition-all duration-200 ${
                      theme === tValue
                        ? "border-primary bg-primary/10 ring-2 ring-primary/20"
                        : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${theme === tValue ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {tValue === "light" && <Sun className="h-6 w-6" />}
                      {tValue === "dark" && <Moon className="h-6 w-6" />}
                      {tValue === "system" && <Monitor className="h-6 w-6" />}
                    </div>
                    <span className="text-sm font-medium capitalize">{tValue}</span>
                  </button>
                ))}
              </div>
              <ThemeEditor />
            </div>

            <div className="space-y-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Languages className="h-4 w-4 text-primary" /> {t('general.language')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('general.language_description', 'Choose your preferred interface language.')}
                  </p>
                </div>
                <Select
                  value={language}
                  onValueChange={(val: Language) => setLanguage(val)}
                >
                  <SelectTrigger className="w-[180px] bg-muted/50 border-border">
                    <SelectValue placeholder="Select Language" />
                  </SelectTrigger>
                  <SelectContent className="bg-background border-border">
                    {languages.map((lang) => (
                      <SelectItem key={lang.code} value={lang.code} className="hover:bg-muted font-medium">
                        {lang.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="editor" className="space-y-8 py-6 animate-in fade-in-50 duration-300">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-base font-semibold flex items-center gap-2">
                    <Type className="h-4 w-4 text-primary" /> {t('editor.font_size')}
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {t('editor.font_size_description', 'Adjust the text size in the code editor.')}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold bg-primary/10 text-primary px-3 py-1 rounded-full border border-primary/20">
                    {fontSize}px
                  </span>
                </div>
              </div>
              <div className="px-2">
                <Slider
                  value={[fontSize]}
                  min={10}
                  max={24}
                  step={1}
                  onValueChange={([val]) => setFontSize(val)}
                  className="py-4"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground font-mono mt-1">
                  <span>10px</span>
                  <span>14px (Default)</span>
                  <span>24px</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-muted/30 border border-border/50">
              <div className="space-y-1">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Save className="h-4 w-4 text-primary" /> {t('editor.format_on_save')}
                </Label>
                <p className="text-sm text-muted-foreground">
                  {t('editor.format_on_save_description', 'Automatically format code when you save a file.')}
                </p>
              </div>
              <Switch
                checked={formatOnSave}
                onCheckedChange={setFormatOnSave}
                className="data-[state=checked]:bg-primary"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl bg-amber-900/20 border border-amber-600/30">
              <div className="space-y-1">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Zap className="h-4 w-4 text-amber-500" /> Experimental Local Build
                </Label>
                <p className="text-sm text-muted-foreground flex gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 text-amber-600 flex-shrink-0" />
                  <span>Compiles Rust contracts entirely in-browser (high memory usage). No backend required.</span>
                </p>
              </div>
              <Switch
                checked={experimentalLocalBuild}
                onCheckedChange={setExperimentalLocalBuild}
                className="data-[state=checked]:bg-amber-600"
              />
            </div>

            <TerminalSettings />
          </TabsContent>

          <TabsContent value="usage" className="space-y-4 py-6 animate-in fade-in-50 duration-300">
            <ResourceUsageDashboard />
          </TabsContent>

          <TabsContent value="diagnostics" className="space-y-4 py-6 animate-in fade-in-50 duration-300">
            <Diagnostics />
          </TabsContent>

          <TabsContent value="environment" className="space-y-4 py-6 animate-in fade-in-50 duration-300">
            <EnvVarManager />
          </TabsContent>

          <TabsContent value="network" className="space-y-4 py-6 animate-in fade-in-50 duration-300">
            <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-muted/20">
              <div className="inline-flex p-3 rounded-full bg-muted mb-4">
                <Globe className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-1">{t('general.network')}</h3>
              <p className="text-muted-foreground max-w-xs mx-auto">
                {t('general.network_description', 'Custom RPC endpoints and specialized network headers will be configurable here.')}
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
