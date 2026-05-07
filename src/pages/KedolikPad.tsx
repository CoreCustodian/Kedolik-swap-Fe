import KedolikPlaceholderPage from '../components/kedolik/KedolikPlaceholderPage';

export default function KedolikPad() {
  return (
    <KedolikPlaceholderPage
      badge="KedolPad"
      title="KedolPad"
      description="KedolPad now has a clean routed page for launchpad-style experiences instead of a dead navigation target. It is ready to be expanded into a full product surface later."
      status="Foundation Ready"
      cards={[
        {
          title: 'Launch Management',
          description:
            'Allocate this page to future token launches, whitelist states, and sale access controls.',
        },
        {
          title: 'Project Discovery',
          description:
            'Provide room for curated project cards, launch schedules, and transparent devnet previews.',
        },
        {
          title: 'Investor Flow',
          description:
            'Use this shell for wallet checks, sale phases, and future claim interfaces when the backend is ready.',
        },
      ]}
    />
  );
}
