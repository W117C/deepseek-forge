// Honest empty module page — no development-phase markers, no fake features.
import { Construction } from "lucide-react";
import { useI18n } from "./../i18n";
import { EmptyState } from "../components/ui";

export default function Placeholder({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{title}</h1>
      </header>
      <EmptyState
        icon={Construction}
        title={title + " · " + t("common.comingSoon")}
        body={t("common.comingSoonBody")}
      />
    </div>
  );
}
