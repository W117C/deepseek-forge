// 未实现模块的统一诚实空态：Coming Soon（不显示开发阶段标记）。
import { useI18n } from "./../i18n";

export default function Placeholder({ title }: { title: string }) {
  const { t } = useI18n();
  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-heading">{title}</h1>
      </header>
      <div className="empty-state placeholder-state">
        <h3>{title} · {t("common.comingSoon")}</h3>
        <p>{t("common.comingSoonBody")}</p>
      </div>
    </div>
  );
}
