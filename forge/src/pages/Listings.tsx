import { ListingPage } from "./Listing";

export function ExplorePage() {
  return (
    <ListingPage
      title="Explore"
      eyebrow="Marketplace"
      subtitle="Search and filter every Agent, Bundle, Plugin and Skill."
    />
  );
}

export function AgentsPage() {
  return (
    <ListingPage
      title="Agents"
      eyebrow="Agents"
      subtitle="Specialized AI Agents for DeepSeek Harness."
      type="agent"
    />
  );
}

export function BundlesPage() {
  return (
    <ListingPage
      title="Bundles"
      eyebrow="Bundles"
      subtitle="Complete capability stacks for specialized Agents."
      type="bundle"
    />
  );
}

export function PluginsPage() {
  return (
    <ListingPage
      title="Plugins"
      eyebrow="Plugins"
      subtitle="Extend the capabilities of DeepSeek Harness."
      type="plugin"
    />
  );
}

export function SkillsPage() {
  return (
    <ListingPage
      title="Skills"
      eyebrow="Skills"
      subtitle="Reusable capabilities for your Agents."
      type="skill"
    />
  );
}
