"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const Joyride = dynamic(
  () => import("react-joyride").then((mod: any) => ({ default: mod.default || mod.Joyride || mod })),
  { ssr: false }
) as any;

const TOUR_KEY = "interactiveTourCompleted";

interface InteractiveTourProps {
  /** Pass true once a sample/example contract has been loaded for the first time. */
  sampleLoaded: boolean;
}

export function InteractiveTour({ sampleLoaded }: InteractiveTourProps) {
  const [run, setRun] = useState(false);

  useEffect(() => {
    if (!sampleLoaded) return;
    if (localStorage.getItem(TOUR_KEY)) return;
    // Small delay so toolbar buttons are fully painted before Joyride measures them
    const timer = setTimeout(() => setRun(true), 600);
    return () => clearTimeout(timer);
  }, [sampleLoaded]);

  const handleCallback = (data: any) => {
    const { status } = data;
    if (["finished", "skipped"].includes(status)) {
      localStorage.setItem(TOUR_KEY, "true");
      setRun(false);
    }
  };

  const steps = [
    {
      target: "#tour-build-btn",
      content:
        "Start here — click Build to compile your Soroban contract into WebAssembly. Watch the terminal for diagnostics and error hints.",
      disableBeacon: true,
    },
    {
      target: "#tour-deploy-btn",
      content:
        "Once the build succeeds, click Deploy to upload the WASM and create a contract instance on the selected network.",
    },
    {
      target: "#tour-test-btn",
      content:
        "Run your test suite here. The IDE discovers all #[test] functions, executes them via cargo test, and shows pass/fail results inline.",
    },
  ];

  return (
    <Joyride
      steps={steps}
      run={run}
      continuous
      scrollToFirstStep
      showProgress
      showSkipButton
      disableOverlayClose
      callback={handleCallback}
      locale={{ last: "Done", skip: "Skip tour" }}
      styles={{
        options: {
          primaryColor: "#EAB308",
          textColor: "#f8fafc",
          backgroundColor: "#0B0D13",
          arrowColor: "#0B0D13",
          overlayColor: "rgba(0, 0, 0, 0.7)",
          zIndex: 10000,
        },
        buttonSkip: {
          color: "#94a3b8",
        },
      }}
    />
  );
}
