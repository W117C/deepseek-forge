import { useState } from "react";
import { Check, Download } from "lucide-react";
import type { AnyPackage } from "../types";
import { useApp } from "../context/app";
import { typeLabel } from "../lib/registry";
import { InstallModal } from "./InstallModal";

interface InstallButtonProps {
  pkg: AnyPackage;
  size?: "sm" | "md" | "lg";
  block?: boolean;
  label?: string;
}

export function InstallButton({ pkg, size = "md", block = false, label }: InstallButtonProps) {
  const { isInstalled } = useApp();
  const [open, setOpen] = useState(false);
  const done = isInstalled(pkg.id);

  const sizeCls = size === "sm" ? "btn-sm" : size === "lg" ? "btn-lg" : "";

  if (done) {
    return (
      <button
        className={"btn btn-installed " + sizeCls + (block ? " btn-block" : "")}
        disabled
        aria-label={pkg.name + " is installed"}
      >
        <Check size={15} />
        Installed
      </button>
    );
  }

  return (
    <>
      <button
        className={"btn btn-primary " + sizeCls + (block ? " btn-block" : "")}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Download size={15} />
        {label ?? "Install " + typeLabel(pkg.type)}
      </button>
      {open && <InstallModal pkg={pkg} onClose={() => setOpen(false)} />}
    </>
  );
}
