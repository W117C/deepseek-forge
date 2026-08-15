// My Skills — dedicated management page for the skill kind.
// Shares the full management machinery (enable/disable/update/uninstall/
// dependents) with My Plugins, scoped to kind === "skill".
import Plugins from "./Plugins";

export default function Skills() {
  return (
    <Plugins
      kinds={["skill"]}
      titleKey="nav.skills"
      subtitleKey="skills.subtitle"
      subCountKey="skills.subCount"
      emptyTitleKey="skills.emptyTitle"
      emptyBodyKey="skills.emptyBody"
    />
  );
}
